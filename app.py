# Study Time Tracker — Flask application entry point.
# All routes, models, and business logic live in this single file (no blueprints).
# See CLAUDE.md for architecture overview, conventions, and environment variable docs.

from alembic.autogenerate.compare import server_defaults
from alembic.autogenerate.compare import schema
from flask import Flask, request, session, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_bcrypt import Bcrypt
from collections import defaultdict
from datetime import datetime
from datetime import timedelta
from flask_session import Session
from dotenv import load_dotenv
import os
import re
import secrets
import time
import string
import pytz
import requests as http_requests
from google import genai
from google.genai import types as genai_types

# app.env is not the default .env filename, so it must be passed explicitly
load_dotenv('app.env')
load_dotenv()  # fallback for any .env file or Railway-injected env vars

app = Flask(__name__)

# --- Database config ---
# Railway injects DATABASE_URL as postgres://, but SQLAlchemy requires postgresql://
database_url = os.getenv('DATABASE_URL', 'sqlite:///study_tracker.db')
if database_url.startswith('postgres://'):
    database_url = database_url.replace('postgres://', 'postgresql://', 1)
app.config['SQLALCHEMY_DATABASE_URI'] = database_url

app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
app.config['SESSION_TYPE'] = 'filesystem'
Session(app)

db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
migrate = Migrate(app, db)

# --- Models ---

class StudyGroup(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String, nullable=False)
    join_code = db.Column(db.String, unique=True, nullable=False)

# --- Helpers ---

def generate_join_code(length=6):
    characters = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(characters) for _ in range(length))

TIMEZONES = pytz.common_timezones

def get_current_datetime(user_timezone=None):
    # Returns naive datetime in the user's local time (no tzinfo).
    # All datetimes in the DB are stored this way — tzinfo is only applied at display time.
    try:
        tz = pytz.timezone(user_timezone) if user_timezone else pytz.UTC
    except pytz.UnknownTimeZoneError:
        tz = pytz.UTC
    return datetime.now(tz).replace(tzinfo=None)

def get_current_date(user_timezone=None):
    try:
        tz = pytz.timezone(user_timezone) if user_timezone else pytz.UTC
    except pytz.UnknownTimeZoneError:
        tz = pytz.UTC
    return datetime.now(tz).date()

def get_user_timezone(username=None):
    if username is None:
        username = session.get('username')

    if username:
        user = User.query.filter_by(username=username).first()
        if user and user.timezone:
            return user.timezone

    return 'UTC'

def send_reset_email(to_email, reset_code):
    api_key = os.getenv('BREVO_API_KEY')

    # Fall back to stdout in local dev when no API key is set
    if not api_key:
        print(f"MOCK EMAIL to {to_email}: Your reset code is {reset_code}")
        return True

    try:
        response = http_requests.post(
            'https://api.brevo.com/v3/smtp/email',
            headers={
                'api-key': api_key,
                'Content-Type': 'application/json',
            },
            json={
                'sender': {'name': 'LockNIn', 'email': 'studytracker.noreply@gmail.com'},
                'to': [{'email': to_email}],
                'subject': 'Password Reset Code - LockNIn',
                'textContent': f'Your password reset code is: {reset_code}\n\nIf you did not request this, please ignore this email.',
            },
            timeout=10,
        )
        if response.status_code in (200, 201):
            return True
        print(f"Brevo error: {response.status_code} {response.text}")
        return False
    except Exception as e:
        print(f"Failed to send email: {e}")
        return False

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String, unique=True, nullable=False)
    fullname = db.Column(db.String, nullable=False)
    password = db.Column(db.String, nullable=True)
    timezone = db.Column(db.String, nullable=False)
    google_id = db.Column(db.String, unique=True, nullable=True)  # set for Google OAuth users
    email = db.Column(db.String, unique=True, nullable=True)      # used for password reset + OAuth linking
    group_id = db.Column(db.Integer, db.ForeignKey('study_group.id'), nullable=True)
    group = db.relationship('StudyGroup', backref='members')
    # AI import rate limiting — reset daily per user's local timezone
    parse_date  = db.Column(db.Date, nullable=True)
    parse_count = db.Column(db.Integer, default=0, nullable=False, server_default='0')

class StudySession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String, nullable=False) 
    course = db.Column(db.String, nullable=False)
    topic = db.Column(db.String, nullable=True)
    start_datetime = db.Column(db.DateTime, nullable=False)
    end_datetime = db.Column(db.DateTime, nullable=False)
    notes = db.Column(db.String, nullable=True)
    hidden_from_notes = db.Column(db.Boolean, default=False, nullable=False)  # soft-delete: row kept to preserve study time stats
    is_important = db.Column(db.Boolean, default=False, nullable=False)

class HomeworkTask(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String, nullable=False)
    course = db.Column(db.String, nullable=False)
    task_name = db.Column(db.String, nullable=False)
    description = db.Column(db.String, nullable=True)
    due_date = db.Column(db.DateTime, nullable=False)
    is_completed = db.Column(db.Boolean, default=False, nullable=False)
    is_important = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=get_current_datetime)


class Event(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String, nullable=False)
    event_name = db.Column(db.String, nullable=False)
    start_datetime = db.Column(db.DateTime, nullable=False)
    end_datetime = db.Column(db.DateTime, nullable=False)
    location = db.Column(db.String, nullable=True)
    description = db.Column(db.String, nullable=True)
    is_completed = db.Column(db.Boolean, default=False, nullable=False)
    is_important = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=get_current_datetime)

class BreakEntry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String, nullable=False)
    start_datetime = db.Column(db.DateTime, nullable=False)
    end_datetime = db.Column(db.DateTime, nullable=False)

class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, nullable=False)
    sender = db.Column(db.String(80), nullable=False)
    content = db.Column(db.Text, nullable=True)
    file_url = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=get_current_datetime)

class Conversation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    type = db.Column(db.String(10), nullable=False)
    group_id = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=get_current_datetime)

class Friendship(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    sender = db.Column(db.String(80), nullable=False)
    receiver = db.Column(db.String(80), nullable=False)
    status = db.Column(db.String(10), nullable=False)
    created_at = db.Column(db.DateTime, default=get_current_datetime)

class ConversationMember(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, nullable=False)
    username = db.Column(db.String(80), nullable=False)
    
# --- Auth Routes ---

# Verify Supabase access token and create/find user in DB
@app.route('/auth/verify', methods=['POST'])
def auth_verify():
    access_token = request.json.get('access_token')
    if not access_token:
        return jsonify({'error': 'No token provided'}), 400

    supabase_url = os.getenv('SUPABASE_URL')
    supabase_anon_key = os.getenv('SUPABASE_ANON_KEY')

    resp = http_requests.get(
        f"{supabase_url}/auth/v1/user",
        headers={
            "Authorization": f"Bearer {access_token}",
            "apikey": supabase_anon_key
        }
    )

    if resp.status_code != 200:
        return jsonify({'error': 'Invalid token'}), 401

    user_data = resp.json()
    google_id = user_data.get('id')
    email = user_data.get('email', '')
    metadata = user_data.get('user_metadata', {})
    full_name = metadata.get('full_name') or metadata.get('name') or email.split('@')[0]

    # Look up by google_id first; fall back to email so that a user who previously
    # registered with a password can link their Google account on first OAuth login
    user = User.query.filter_by(google_id=google_id).first()
    if not user and email:
        user = User.query.filter_by(email=email).first()

    if not user:
        base_username = re.sub(r'[^a-zA-Z0-9_]', '', email.split('@')[0]) or 'user'
        username = base_username
        counter = 1
        while User.query.filter_by(username=username).first():
            username = f"{base_username}{counter}"
            counter += 1

        user = User(
            username=username,
            fullname=full_name,
            email=email,
            password=None,
            timezone='UTC',
            google_id=google_id
        )
        db.session.add(user)
        db.session.commit()
    else:
        # Attach google_id and email to existing account if not set
        changed = False
        if not user.google_id:
            user.google_id = google_id
            changed = True
        if not user.email:
            user.email = email
            changed = True
        if changed:
            db.session.commit()

    session['username'] = user.username
    return jsonify({'success': True})

# --- Homework API Routes (JSON) ---
# These mirror the template-based routes above but return JSON for the React frontend.
# The React app calls these via fetch(); Flask responds with data, not HTML.

@app.route('/api/homework', methods=['GET'])
def api_get_homework():
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401

    username = session['username']
    tasks = HomeworkTask.query.filter_by(username=username).order_by(HomeworkTask.due_date.asc()).all()

    # Convert each SQLAlchemy model object to a plain dict so jsonify() can serialize it.
    # SQLAlchemy objects can't be serialized to JSON directly — you have to extract the fields manually.
    return jsonify([{
        'id': t.id,
        'course': t.course,
        'task_name': t.task_name,
        'description': t.description,
        'due_date': t.due_date.isoformat(),  # ISO string e.g. "2026-08-15T23:59:00" — easy to parse in JS
        'is_completed': t.is_completed,
        'is_important': t.is_important,
    } for t in tasks])

@app.route('/api/homework', methods=['POST'])
def api_create_homework():
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401

    data = request.get_json()
    username = session['username']

    try:
        due_date = datetime.fromisoformat(data['due_date'])
    except (KeyError, ValueError):
        return jsonify({'error': 'Invalid due_date'}), 400

    task = HomeworkTask(
        username=username,
        course=data.get('course', ''),
        task_name=data.get('task_name', ''),
        description=data.get('description') or None,
        due_date=due_date,
    )
    db.session.add(task)
    db.session.commit()

    # Return the created task so React can add it to the list immediately without re-fetching.
    return jsonify({
        'id': task.id,
        'course': task.course,
        'task_name': task.task_name,
        'description': task.description,
        'due_date': task.due_date.isoformat(),
        'is_completed': task.is_completed,
        'is_important': task.is_important,
    }), 201

@app.route('/api/homework/<int:task_id>/complete', methods=['POST'])
def api_complete_task(task_id):
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401

    task = HomeworkTask.query.get_or_404(task_id)
    if task.username != session['username']:
        return jsonify({'error': 'Forbidden'}), 403

    task.is_completed = not task.is_completed
    db.session.commit()
    return jsonify({'id': task.id, 'is_completed': task.is_completed})

@app.route('/api/homework/<int:task_id>/importance', methods=['POST'])
def api_toggle_task_importance(task_id):
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401

    task = HomeworkTask.query.get_or_404(task_id)
    if task.username != session['username']:
        return jsonify({'error': 'Forbidden'}), 403

    task.is_important = not task.is_important
    db.session.commit()
    return jsonify({'id': task.id, 'is_important': task.is_important})

@app.route('/api/homework/<int:task_id>', methods=['DELETE'])
def api_delete_task(task_id):
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401

    task = HomeworkTask.query.get_or_404(task_id)
    if task.username != session['username']:
        return jsonify({'error': 'Forbidden'}), 403

    db.session.delete(task)
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/homework/<int:task_id>', methods=['PUT'])
def api_edit_task(task_id):
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401

    task = HomeworkTask.query.get_or_404(task_id)
    if task.username != session['username']:
        return jsonify({'error': 'Forbidden'}), 403

    data = request.get_json()
    task.course = data.get('course', task.course)
    task.task_name = data.get('task_name', task.task_name)
    task.description = data.get('description') or None
    try:
        task.due_date = datetime.fromisoformat(data['due_date'])
    except (KeyError, ValueError):
        return jsonify({'error': 'Invalid due_date'}), 400

    db.session.commit()
    return jsonify({
        'id': task.id,
        'course': task.course,
        'task_name': task.task_name,
        'description': task.description,
        'due_date': task.due_date.isoformat(),
        'is_completed': task.is_completed,
        'is_important': task.is_important,
    })

# --- Events API Routes (JSON) ---

@app.route('/api/events', methods=['GET'])
def api_get_events():
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401
    events = Event.query.filter_by(username=session['username']).order_by(Event.start_datetime.asc()).all()
    return jsonify([{
        'id': e.id,
        'event_name': e.event_name,
        'start_datetime': e.start_datetime.isoformat(),
        'end_datetime': e.end_datetime.isoformat(),
        'location': e.location,
        'description': e.description,
        'is_completed': e.is_completed,
        'is_important': e.is_important,
    } for e in events])

@app.route('/api/events', methods=['POST'])
def api_create_event():
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401
    data = request.get_json()
    try:
        start = datetime.fromisoformat(data['start_datetime'])
        end = datetime.fromisoformat(data['end_datetime'])
    except (KeyError, ValueError):
        return jsonify({'error': 'Invalid datetimes'}), 400
    if start >= end:
        return jsonify({'error': 'Start must be before end'}), 400
    event = Event(
        username=session['username'],
        event_name=data.get('event_name', ''),
        start_datetime=start,
        end_datetime=end,
        location=data.get('location') or None,
        description=data.get('description') or None,
    )
    db.session.add(event)
    db.session.commit()
    return jsonify({
        'id': event.id, 'event_name': event.event_name,
        'start_datetime': event.start_datetime.isoformat(),
        'end_datetime': event.end_datetime.isoformat(),
        'location': event.location, 'description': event.description,
        'is_completed': event.is_completed, 'is_important': event.is_important,
    }), 201

@app.route('/api/events/<int:event_id>/complete', methods=['POST'])
def api_complete_event(event_id):
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401
    event = Event.query.get_or_404(event_id)
    if event.username != session['username']:
        return jsonify({'error': 'Forbidden'}), 403
    event.is_completed = not event.is_completed
    db.session.commit()
    return jsonify({'id': event.id, 'is_completed': event.is_completed})

@app.route('/api/events/<int:event_id>/importance', methods=['POST'])
def api_toggle_event_importance(event_id):
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401
    event = Event.query.get_or_404(event_id)
    if event.username != session['username']:
        return jsonify({'error': 'Forbidden'}), 403
    event.is_important = not event.is_important
    db.session.commit()
    return jsonify({'id': event.id, 'is_important': event.is_important})

@app.route('/api/events/<int:event_id>', methods=['DELETE'])
def api_delete_event(event_id):
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401
    event = Event.query.get_or_404(event_id)
    if event.username != session['username']:
        return jsonify({'error': 'Forbidden'}), 403
    db.session.delete(event)
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/events/<int:event_id>', methods=['PUT'])
def api_edit_event(event_id):
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401
    event = Event.query.get_or_404(event_id)
    if event.username != session['username']:
        return jsonify({'error': 'Forbidden'}), 403
    data = request.get_json()
    event.event_name = data.get('event_name', event.event_name)
    event.location = data.get('location') or None
    event.description = data.get('description') or None
    try:
        event.start_datetime = datetime.fromisoformat(data['start_datetime'])
        event.end_datetime = datetime.fromisoformat(data['end_datetime'])
    except (KeyError, ValueError):
        return jsonify({'error': 'Invalid datetime'}), 400
    db.session.commit()
    return jsonify({
        'id': event.id,
        'event_name': event.event_name,
        'start_datetime': event.start_datetime.isoformat(),
        'end_datetime': event.end_datetime.isoformat(),
        'location': event.location,
        'description': event.description,
        'is_completed': event.is_completed,
        'is_important': event.is_important,
    })

# --- Study Groups ---

def calculate_duration_mins(start_datetime, end_datetime, target_date=None):
    # When target_date is given, clips the session to only the portion that falls on that day.
    # Needed because sessions can span midnight.
    if target_date is None:
        return (end_datetime - start_datetime).total_seconds() / 60.0
    
    # Calculate minutes specifically for the target_date
    start_of_target = datetime.combine(target_date, datetime.min.time())
    end_of_target = start_of_target + timedelta(days=1)
    
    chunk_start = max(start_datetime, start_of_target)
    chunk_end = min(end_datetime, end_of_target)
    
    if chunk_start < chunk_end:
        return (chunk_end - chunk_start).total_seconds() / 60.0
    return 0.0

# =============================================================================
# JSON API Routes for the React frontend
# All routes below mirror the template-based routes above but return JSON.
# Pattern: auth check → ownership check → database op → jsonify response.
# =============================================================================

# --- Auth API Routes ---

@app.route('/api/auth/supabase-config', methods=['GET'])
def api_supabase_config():
    """Returns public Supabase keys for the React frontend to initialize the JS SDK."""
    return jsonify({
        'supabase_url': os.getenv('SUPABASE_URL', ''),
        'supabase_anon_key': os.getenv('SUPABASE_ANON_KEY', ''),
    })

@app.route('/api/auth/me', methods=['GET'])
def api_auth_me():
    """Returns the logged-in user's info, or 401 if the session has no username."""
    username = session.get('username')
    if not username:
        return jsonify({'error': 'Not logged in'}), 401
    user = User.query.filter_by(username=username).first()
    if not user:
        return jsonify({'error': 'User not found'}), 404
    return jsonify({
        'username': user.username,
        'fullname': user.fullname,
        'email': user.email,
        'timezone': user.timezone,
        'has_google': user.google_id is not None,
    })

@app.route('/api/auth/login', methods=['POST'])
def api_auth_login():
    """Username/password login — sets Flask session cookie on success."""
    data = request.get_json()
    username = data.get('username', '').strip()
    password = data.get('password', '')

    user = User.query.filter_by(username=username).first()
    if not user or not user.password or not bcrypt.check_password_hash(user.password, password):
        return jsonify({'error': 'Invalid username or password'}), 401

    session['username'] = user.username
    return jsonify({'username': user.username, 'fullname': user.fullname})

@app.route('/api/auth/forgot-password', methods=['POST'])
def api_forgot_password():
    data = request.get_json()
    email = (data.get('email') or '').strip()
    if not email:
        return jsonify({'error': 'Email is required'}), 400
    user = User.query.filter_by(email=email).first()
    if not user:
        # Don't reveal whether the email exists — security best practice
        return jsonify({'message': 'If that email is registered, a code has been sent.'}), 200
    # 60-second cooldown to prevent spam
    last_sent = session.get('reset_code_sent_at')
    if last_sent and (time.time() - last_sent) < 60:
        remaining = int(60 - (time.time() - last_sent))
        return jsonify({'error': f'Please wait {remaining}s before requesting another code.'}), 429
    import random
    code = f"{random.randint(100000, 999999)}"
    session['reset_code'] = code
    session['reset_email'] = email
    session['reset_code_sent_at'] = time.time()
    session['reset_code_expiry'] = time.time() + 600  # 10-minute window
    send_reset_email(email, code)
    return jsonify({'message': 'If that email is registered, a code has been sent.'}), 200

@app.route('/api/auth/reset-password', methods=['POST'])
def api_reset_password():
    data = request.get_json()
    email = (data.get('email') or '').strip()
    code = (data.get('code') or '').strip()
    new_password = data.get('new_password', '')
    if not all([email, code, new_password]):
        return jsonify({'error': 'Email, code, and new password are required'}), 400
    if time.time() > session.get('reset_code_expiry', 0):
        return jsonify({'error': 'Code has expired. Please request a new one.'}), 400
    if code != session.get('reset_code') or email != session.get('reset_email'):
        return jsonify({'error': 'Invalid code. Please try again.'}), 400
    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({'error': 'Something went wrong. Please try again.'}), 400
    user.password = bcrypt.generate_password_hash(new_password).decode('utf-8')
    db.session.commit()
    for key in ('reset_code', 'reset_email', 'reset_code_sent_at', 'reset_code_expiry'):
        session.pop(key, None)
    return jsonify({'message': 'Password updated successfully.'})

@app.route('/api/auth/logout', methods=['POST'])
def api_auth_logout():
    """Clears the Flask session, logging the user out."""
    session.pop('username', None)
    return jsonify({'success': True})

@app.route('/api/auth/register', methods=['POST'])
def api_auth_register():
    """Creates a new user account and logs them in immediately."""
    data = request.get_json()
    username = data.get('username', '').strip()
    fullname = data.get('fullname', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', '')
    confirm_password = data.get('confirm_password', '')
    timezone = data.get('timezone', 'UTC')

    if not username or not fullname or not password or not email:
        return jsonify({'error': 'All fields are required'}), 400
    if password != confirm_password:
        return jsonify({'error': 'Passwords do not match'}), 400
    if timezone not in TIMEZONES:
        return jsonify({'error': 'Invalid timezone'}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username already taken'}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Email already registered'}), 400

    hashed = bcrypt.generate_password_hash(password).decode('utf-8')
    new_user = User(username=username, fullname=fullname, email=email, password=hashed, timezone=timezone)
    db.session.add(new_user)
    db.session.commit()
    session['username'] = new_user.username
    return jsonify({'username': new_user.username, 'fullname': new_user.fullname}), 201

@app.route('/api/timezones', methods=['GET'])
def api_timezones():
    """Returns all pytz timezone strings — used to populate the timezone selector in Profile/Register."""
    return jsonify(TIMEZONES)

# --- Breaks API Routes ---

@app.route('/api/breaks', methods=['GET'])
def api_get_breaks():
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401
    breaks = BreakEntry.query.filter_by(username=session['username']).order_by(BreakEntry.start_datetime.desc()).all()
    return jsonify([{
        'id': b.id,
        'start_datetime': b.start_datetime.isoformat() + 'Z',
        'end_datetime': b.end_datetime.isoformat() + 'Z',
    } for b in breaks])

@app.route('/api/breaks', methods=['POST'])
def api_create_break():
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401
    data = request.get_json()
    try:
        start = datetime.fromisoformat(data['start_datetime'])
        end = datetime.fromisoformat(data['end_datetime'])
    except (KeyError, ValueError):
        return jsonify({'error': 'Invalid datetimes'}), 400
    entry = BreakEntry(username=session['username'], start_datetime=start, end_datetime=end)
    db.session.add(entry)
    db.session.commit()
    return jsonify({
        'id': entry.id,
        'start_datetime': entry.start_datetime.isoformat() + 'Z',
        'end_datetime': entry.end_datetime.isoformat() + 'Z',
    }), 201

@app.route('/api/breaks/<int:break_id>', methods=['DELETE'])
def api_delete_break(break_id):
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401
    entry = BreakEntry.query.get_or_404(break_id)
    if entry.username != session['username']:
        return jsonify({'error': 'Forbidden'}), 403
    db.session.delete(entry)
    db.session.commit()
    return jsonify({'success': True})

# --- Study Sessions API Routes ---

@app.route('/api/sessions', methods=['GET'])
def api_get_sessions():
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401
    sessions_list = StudySession.query.filter_by(username=session['username']).order_by(StudySession.start_datetime.desc()).all()
    return jsonify([{
        'id': s.id,
        'course': s.course,
        'topic': s.topic,
        'start_datetime': s.start_datetime.isoformat() + 'Z',
        'end_datetime': s.end_datetime.isoformat() + 'Z',
        'notes': s.notes,
        'is_important': s.is_important,
    } for s in sessions_list])

@app.route('/api/sessions', methods=['POST'])
def api_create_session():
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401
    data = request.get_json()
    try:
        start = datetime.fromisoformat(data['start_datetime'])
        end = datetime.fromisoformat(data['end_datetime'])
    except (KeyError, ValueError):
        return jsonify({'error': 'Invalid datetimes'}), 400
    s = StudySession(
        username=session['username'],
        course=data.get('course', ''),
        topic=data.get('topic') or None,
        start_datetime=start,
        end_datetime=end,
        notes=data.get('notes') or None,
    )
    db.session.add(s)
    db.session.commit()
    return jsonify({
        'id': s.id, 'course': s.course, 'topic': s.topic,
        'start_datetime': s.start_datetime.isoformat() + 'Z',
        'end_datetime': s.end_datetime.isoformat() + 'Z',
        'notes': s.notes, 'is_important': s.is_important,
    }), 201

@app.route('/api/sessions/<int:session_id>', methods=['DELETE'])
def api_delete_session(session_id):
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401
    s = StudySession.query.get_or_404(session_id)
    if s.username != session['username']:
        return jsonify({'error': 'Forbidden'}), 403
    db.session.delete(s)
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/sessions/<int:session_id>/importance', methods=['POST'])
def api_toggle_session_importance(session_id):
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401
    s = StudySession.query.get_or_404(session_id)
    if s.username != session['username']:
        return jsonify({'error': 'Forbidden'}), 403
    s.is_important = not s.is_important
    db.session.commit()
    return jsonify({'id': s.id, 'is_important': s.is_important})

# --- Notes API Routes ---
# Notes are study sessions with hidden_from_notes=False.
# "Deleting" a note is a soft delete — the row stays (preserving study time stats)
# but hidden_from_notes is set True and the notes text is cleared.

@app.route('/api/notes', methods=['GET'])
def api_get_notes():
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401
    notes_list = StudySession.query.filter_by(
        username=session['username'],
        hidden_from_notes=False
    ).order_by(StudySession.start_datetime.desc()).all()
    return jsonify([{
        'id': n.id,
        'course': n.course,
        'topic': n.topic,
        'start_datetime': n.start_datetime.isoformat() + 'Z',
        'end_datetime': n.end_datetime.isoformat() + 'Z',
        'notes': n.notes,
        'is_important': n.is_important,
    } for n in notes_list])

@app.route('/api/notes/<int:session_id>/importance', methods=['POST'])
def api_toggle_note_importance(session_id):
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401
    s = StudySession.query.get_or_404(session_id)
    if s.username != session['username']:
        return jsonify({'error': 'Forbidden'}), 403
    s.is_important = not s.is_important
    db.session.commit()
    return jsonify({'id': s.id, 'is_important': s.is_important})

@app.route('/api/notes/<int:session_id>', methods=['PUT'])
def api_edit_note(session_id):
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401
    s = StudySession.query.get_or_404(session_id)
    if s.username != session['username']:
        return jsonify({'error': 'Forbidden'}), 403
    data = request.get_json()
    if 'course' in data:
        s.course = data['course']
    if 'topic' in data:
        s.topic = data['topic'] or None
    if 'notes' in data:
        s.notes = data['notes'] or None
    db.session.commit()
    return jsonify({
        'id': s.id, 'course': s.course, 'topic': s.topic,
        'notes': s.notes, 'is_important': s.is_important,
    })

@app.route('/api/notes/<int:session_id>', methods=['DELETE'])
def api_delete_note(session_id):
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401
    s = StudySession.query.get_or_404(session_id)
    if s.username != session['username']:
        return jsonify({'error': 'Forbidden'}), 403
    s.hidden_from_notes = True
    s.notes = None
    db.session.commit()
    return jsonify({'success': True})

# --- Profile API Routes ---

@app.route('/api/profile', methods=['GET'])
def api_get_profile():
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401
    user = User.query.filter_by(username=session['username']).first()
    return jsonify({
        'username': user.username,
        'fullname': user.fullname,
        'email': user.email,
        'timezone': user.timezone,
        'has_google': user.google_id is not None,
        'has_password': user.password is not None,
    })

@app.route('/api/profile', methods=['PUT'])
def api_update_profile():
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401
    user = User.query.filter_by(username=session['username']).first()
    data = request.get_json()

    if data.get('fullname'):
        user.fullname = data['fullname'].strip()

    if data.get('timezone'):
        if data['timezone'] not in TIMEZONES:
            return jsonify({'error': 'Invalid timezone'}), 400
        user.timezone = data['timezone']

    # Email can only be added (not changed) if the account doesn't have one yet
    if data.get('email') and not user.email:
        existing = User.query.filter_by(email=data['email']).first()
        if existing:
            return jsonify({'error': 'Email already linked to another account'}), 400
        user.email = data['email'].strip()

    db.session.commit()
    return jsonify({
        'username': user.username,
        'fullname': user.fullname,
        'email': user.email,
        'timezone': user.timezone,
        'has_google': user.google_id is not None,
        'has_password': user.password is not None,
    })

# --- Study Groups API Routes ---

@app.route('/api/groups/me', methods=['GET'])
def api_group_me():
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401
    user = User.query.filter_by(username=session['username']).first()
    if not user.group_id:
        return jsonify({'group': None})
    group = StudyGroup.query.get(user.group_id)
    members = [u.username for u in User.query.filter_by(group_id=group.id).all()]
    return jsonify({
        'group': {
            'id': group.id,
            'name': group.name,
            'join_code': group.join_code,
            'members': members,
        }
    })

@app.route('/api/groups/create', methods=['POST'])
def api_create_group():
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401
    data = request.get_json()
    group_name = (data.get('group_name') or '').strip()
    if not group_name:
        return jsonify({'error': 'Group name is required'}), 400
    # Generate a unique join code
    while True:
        code = generate_join_code()
        if not StudyGroup.query.filter_by(join_code=code).first():
            break
    new_group = StudyGroup(name=group_name, join_code=code)
    db.session.add(new_group)
    db.session.commit()
    user = User.query.filter_by(username=session['username']).first()
    user.group_id = new_group.id
    db.session.commit()
    return jsonify({'name': new_group.name, 'join_code': new_group.join_code}), 201

@app.route('/api/groups/join', methods=['POST'])
def api_join_group():
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401
    data = request.get_json()
    join_code = (data.get('join_code') or '').upper().strip()
    if not join_code:
        return jsonify({'error': 'Join code is required'}), 400
    group = StudyGroup.query.filter_by(join_code=join_code).first()
    if not group:
        return jsonify({'error': 'Invalid join code'}), 404
    user = User.query.filter_by(username=session['username']).first()
    user.group_id = group.id
    db.session.commit()
    return jsonify({'name': group.name, 'join_code': group.join_code})

@app.route('/api/groups/leave', methods=['POST'])
def api_leave_group():
    # Auto-deletes the group when the last member leaves
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401
    user = User.query.filter_by(username=session['username']).first()
    group_id = user.group_id
    user.group_id = None
    db.session.commit()
    if group_id:
        remaining = User.query.filter_by(group_id=group_id).count()
        if remaining == 0:
            group = StudyGroup.query.get(group_id)
            if group:
                db.session.delete(group)
                db.session.commit()
    return jsonify({'success': True})

# --- Calendar API Route ---

@app.route('/api/calendar', methods=['GET'])
def api_calendar_data():
    """Returns homework tasks and events formatted for FullCalendar's EventInput schema."""
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401

    username = session['username']
    now = get_current_datetime(get_user_timezone(username))
    tasks = HomeworkTask.query.filter_by(username=username).all()
    events = Event.query.filter_by(username=username).all()

    calendar_events = []

    for task in tasks:
        color = '#48bb78' if task.is_completed else ('#e53e3e' if task.due_date < now else '#f59e0b')
        calendar_events.append({
            'id': f'task-{task.id}',
            'title': f"{task.course}: {task.task_name}",
            'start': task.due_date.isoformat(),
            'backgroundColor': color,
            'borderColor': color,
            'textColor': '#fff',
            'display': 'list-item',
            'extendedProps': {
                'type': 'task',
                'completed': task.is_completed,
                'description': task.description or '',
                'deadline': task.due_date.strftime('%B %d, %Y at %I:%M %p'),
            }
        })

    for event in events:
        end_dt = event.end_datetime
        # FullCalendar treats midnight as end-of-previous-day — nudge to keep event visible
        if end_dt.hour == 0 and end_dt.minute == 0:
            end_dt = end_dt + timedelta(minutes=1)
        calendar_events.append({
            'id': f'event-{event.id}',
            'title': event.event_name,
            'start': event.start_datetime.isoformat(),
            'end': end_dt.isoformat(),
            'backgroundColor': '#48bb78' if event.is_completed else '#667eea',
            'borderColor': '#38a169' if event.is_completed else '#5568d3',
            'textColor': '#fff',
            'display': 'block',
            'extendedProps': {
                'type': 'event',
                'completed': event.is_completed,
                'location': event.location or '',
                'description': event.description or '',
            }
        })

    return jsonify(calendar_events)

# --- Summary API Route ---
# Mirrors the /summary template route but returns pure JSON.
# Most complex route: queries all sessions/breaks for the user (and group members),
# aggregates by day handling midnight-spanning sessions, and computes heatmap data.

@app.route('/api/summary', methods=['GET'])
def api_summary_data():
    current_username = session.get('username')
    if not current_username:
        return jsonify({'error': 'Not logged in'}), 401

    current_user = User.query.filter_by(username=current_username).first()
    if not current_user:
        return jsonify({'error': 'User not found'}), 404

    user_tz = get_user_timezone(current_username)
    today = get_current_date(user_tz)
    today_start_dt = datetime.combine(today, datetime.min.time())
    today_end_dt = today_start_dt + timedelta(days=1)
    week_start = today - timedelta(days=today.weekday())

    has_group = current_user.group_id is not None
    group_info = None

    if has_group:
        group = StudyGroup.query.get(current_user.group_id)
        group_info = {'name': group.name, 'join_code': group.join_code}
        all_users = User.query.filter_by(group_id=current_user.group_id).all()
    else:
        all_users = [current_user]

    if current_user in all_users:
        all_users.remove(current_user)
    all_users.insert(0, current_user)

    friend_names, friend_study_hours, friend_break_hours, friend_today_study, friend_today_break = [], [], [], [], []

    for user in all_users:
        user_sessions = StudySession.query.filter_by(username=user.username).filter(
            StudySession.start_datetime >= week_start
        ).all()
        user_breaks = BreakEntry.query.filter_by(username=user.username).filter(
            BreakEntry.start_datetime >= week_start
        ).all()
        total_study_mins = sum((s.end_datetime - s.start_datetime).total_seconds() / 60.0 for s in user_sessions)
        total_break_mins = sum((b.end_datetime - b.start_datetime).total_seconds() / 60.0 for b in user_breaks)

        user_today_sessions = StudySession.query.filter_by(username=user.username).filter(
            StudySession.start_datetime < today_end_dt, StudySession.end_datetime >= today_start_dt
        ).all()
        user_today_breaks = BreakEntry.query.filter_by(username=user.username).filter(
            BreakEntry.start_datetime < today_end_dt, BreakEntry.end_datetime >= today_start_dt
        ).all()
        today_study = sum(calculate_duration_mins(s.start_datetime, s.end_datetime, today) for s in user_today_sessions)
        today_break = sum(calculate_duration_mins(b.start_datetime, b.end_datetime, today) for b in user_today_breaks)

        friend_names.append(user.fullname)
        friend_study_hours.append(round(total_study_mins / 60, 2))
        friend_break_hours.append(round(total_break_mins / 60, 2))
        friend_today_study.append(round(today_study / 60, 2))
        friend_today_break.append(round(today_break / 60, 2))

    sorted_data = sorted(
        zip(friend_study_hours, friend_break_hours, friend_names, friend_today_study, friend_today_break),
        reverse=True
    )
    if sorted_data:
        friend_study_hours, friend_break_hours, friend_names, friend_today_study, friend_today_break = map(list, zip(*sorted_data))

    my_sessions = StudySession.query.filter_by(username=current_username).order_by(StudySession.start_datetime).all()
    my_breaks = BreakEntry.query.filter_by(username=current_username).order_by(BreakEntry.start_datetime).all()

    daily_study = defaultdict(float)
    daily_break = defaultdict(float)

    for s in my_sessions:
        current = s.start_datetime
        while current < s.end_datetime:
            next_day = (current + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
            end_of_chunk = min(s.end_datetime, next_day)
            daily_study[current.date()] += (end_of_chunk - current).total_seconds() / 3600.0
            current = end_of_chunk

    for b in my_breaks:
        current = b.start_datetime
        while current < b.end_datetime:
            next_day = (current + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
            end_of_chunk = min(b.end_datetime, next_day)
            daily_break[current.date()] += (end_of_chunk - current).total_seconds() / 3600.0
            current = end_of_chunk

    first_date = None
    if daily_study or daily_break:
        first_date = min(list(daily_study.keys()) + list(daily_break.keys()))
        last_date = max(list(daily_study.keys()) + list(daily_break.keys()))
        total_days = (last_date - first_date).days + 1
        daily_labels = [(first_date + timedelta(days=i)).strftime('%b %d') for i in range(total_days)]
        daily_study_values = [round(daily_study.get(first_date + timedelta(days=i), 0), 2) for i in range(total_days)]
        daily_break_values = [round(daily_break.get(first_date + timedelta(days=i), 0), 2) for i in range(total_days)]
    else:
        daily_labels, daily_study_values, daily_break_values = [], [], []

    # Streak computation — based on days with any study time
    current_streak = 0
    longest_streak = 0
    if daily_study:
        check = today
        while daily_study.get(check, 0) > 0:
            current_streak += 1
            check -= timedelta(days=1)

        run = 0
        scan = min(daily_study.keys())
        while scan <= today:
            if daily_study.get(scan, 0) > 0:
                run += 1
                if run > longest_streak:
                    longest_streak = run
            else:
                run = 0
            scan += timedelta(days=1)

    # Extend heatmap back to Jan 1 of the first year with data so the frontend
    # can filter by full calendar year (not just rolling 365 days)
    heatmap_start = first_date.replace(month=1, day=1) if first_date else today.replace(month=1, day=1)
    total_heatmap_days = (today - heatmap_start).days + 1
    heatmap_data = [
        {'date': (heatmap_start + timedelta(days=i)).strftime('%Y-%m-%d'),
         'hours': round(daily_study.get(heatmap_start + timedelta(days=i), 0), 2)}
        for i in range(total_heatmap_days)
    ]

    course_totals = defaultdict(float)
    for s in my_sessions:
        course_totals[s.course] += (s.end_datetime - s.start_datetime).total_seconds() / 60.0

    today_sessions_q = StudySession.query.filter_by(username=current_username).filter(
        StudySession.start_datetime < today_end_dt, StudySession.end_datetime >= today_start_dt
    ).all()
    today_breaks_q = BreakEntry.query.filter_by(username=current_username).filter(
        BreakEntry.start_datetime < today_end_dt, BreakEntry.end_datetime >= today_start_dt
    ).all()
    today_course_totals = defaultdict(float)
    for s in today_sessions_q:
        today_course_totals[s.course] += calculate_duration_mins(s.start_datetime, s.end_datetime, today)
    today_study_mins = sum(calculate_duration_mins(s.start_datetime, s.end_datetime, today) for s in today_sessions_q)
    today_break_mins = sum(calculate_duration_mins(b.start_datetime, b.end_datetime, today) for b in today_breaks_q)

    return jsonify({
        'current_username': current_username,
        'current_fullname': current_user.fullname,
        'has_group': has_group,
        'group_info': group_info,
        'friend_names': friend_names,
        'friend_study_hours': friend_study_hours,
        'friend_break_hours': friend_break_hours,
        'friend_today_study': friend_today_study,
        'friend_today_break': friend_today_break,
        'course_labels': list(course_totals.keys()),
        'course_hours': [round(m / 60, 2) for m in course_totals.values()],
        'daily_labels': daily_labels,
        'daily_study_values': daily_study_values,
        'daily_break_values': daily_break_values,
        'today_course_labels': list(today_course_totals.keys()),
        'today_course_hours': [round(m / 60, 2) for m in today_course_totals.values()],
        'today_study_hours': round(today_study_mins / 60, 2),
        'today_break_hours': round(today_break_mins / 60, 2),
        'heatmap_data': heatmap_data,
        'current_streak': current_streak,
        'longest_streak': longest_streak,
    })

# --- AI Parse Route ---
# Sends raw text to Gemini and returns structured tasks/events for the Import page.
# The frontend shows these as editable cards before the user confirms creation.

@app.route('/api/parse', methods=['POST'])
def api_parse():
    if session.get('username') is None:
        return jsonify({'error': 'Not logged in'}), 401

    data = request.get_json()
    text = (data.get('text') or '').strip()
    if not text:
        return jsonify({'error': 'No text provided'}), 400
    if len(text) > 20000:
        return jsonify({'error': 'Input too long — maximum 20000 characters.'}), 400

    username = session['username']
    user = User.query.filter_by(username=username).first()
    today_date = get_current_date(get_user_timezone(username))

    # Reset counter if it's a new day (in the user's local timezone)
    if user.parse_date != today_date:
        user.parse_count = 0
        user.parse_date  = today_date

    if user.parse_count >= 1:
        return jsonify({'error': 'Daily limit reached — you can use Import once per day.'}), 429

    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        return jsonify({'error': 'GEMINI_API_KEY not set in app.env'}), 500

    today = get_current_datetime(get_user_timezone(username))
    today_str = today.strftime('%A, %B %d, %Y')

    prompt = f"""Today is {today_str}.

Extract all homework tasks and calendar events from the text below.
Return a JSON object with an "items" array.

Each item must have:
  "type": "task" or "event"

For a task (assignment, quiz, exam due date, homework):
  "type": "task"
  "course": string (course code or name, e.g. "COMP 101") — use null if unknown
  "task_name": string
  "description": string or null
  "due_date": ISO 8601 datetime string or null (e.g. "2026-09-15T23:59:00") — if no time given, use 23:59:00

For an event (lecture, lab, meeting, exam at a specific time):
  "type": "event"
  "event_name": string
  "start_datetime": ISO 8601 datetime string or null — FIRST occurrence only
  "end_datetime": ISO 8601 datetime string or null (if duration not given, assume 1 hour after start) — FIRST occurrence only
  "location": string or null
  "description": string or null
  "recurrence": object or null — include ONLY for recurring events:
    "days": array of day abbreviations the event repeats on, e.g. ["Tue", "Thu"] (use Mon/Tue/Wed/Thu/Fri/Sat/Sun)
    "until": ISO date string YYYY-MM-DD — last date of the recurrence range

Rules:
- If year is not specified, assume {today.year} or {today.year + 1} based on context (e.g. a date that has already passed this year → next year).
- Recurring events: set start_datetime/end_datetime to the FIRST occurrence only, and populate "recurrence". Do NOT generate multiple items for recurring events.
- Non-recurring events: omit "recurrence" entirely (or set to null).
- If something could be either type, make your best guess.
- Keep description fields SHORT (under 100 characters). Omit redundant or low-value details.
- Omit null fields entirely rather than including them as null.

Text:
{text}"""

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model='gemini-3.5-flash',
            contents=prompt,
            config=genai_types.GenerateContentConfig(
                response_mime_type='application/json',
                max_output_tokens=8192,
            ),
        )
        import json
        raw = response.text.strip()

        # Strip markdown fences in case Gemini wraps the JSON anyway
        if raw.startswith('```'):
            raw = raw.split('\n', 1)[1] if '\n' in raw else raw[3:]
        if raw.endswith('```'):
            raw = raw.rsplit('```', 1)[0]

        try:
            parsed = json.loads(raw.strip())
        except json.JSONDecodeError as je:
            # Include a snippet of what Gemini returned to help debug
            preview = raw[:300].replace('\n', ' ')
            return jsonify({'error': f'Gemini returned invalid JSON: {je}. Response preview: {preview}'}), 500

        items = parsed.get('items', [])

        # Validate basic shape — each item must have a type
        valid = [item for item in items if item.get('type') in ('task', 'event')]

        # Only count against the limit on a successful parse
        user.parse_count += 1
        db.session.commit()

        return jsonify({'items': valid})

    except Exception as e:
        return jsonify({'error': f'Parse failed: {str(e)}'}), 500


# --- Entry Point ---
if __name__ == '__main__':
    app.run(debug=True)