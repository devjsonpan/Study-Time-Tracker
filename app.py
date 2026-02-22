# Import the necessary modules from the libraries
from flask import Flask, render_template, request, redirect, url_for, session, flash, get_flashed_messages
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from flask_session import Session

# Initialize the Flask application
app = Flask(__name__)

# Configure SQLAlchemy to use the SQLite database
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///study_tracker.db'

# Configure Flask-Session
app.config['SECRET_KEY'] = 'random_secret_key'
app.config['SESSION_TYPE'] = 'filesystem'
Session(app)

# Create an instance of SQLAlchemy to interact with the database
db = SQLAlchemy(app)

# Define the User model for the database
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String, unique=True, nullable=False)
    fullname = db.Column(db.String, nullable=False)
    password = db.Column(db.String, nullable=False)
    security_question = db.Column(db.String, nullable=False)
    security_answer = db.Column(db.String, nullable=False)

# Define the StudySession model for the database
class StudySession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String, nullable=False) 
    course = db.Column(db.String, nullable=False)
    topic = db.Column(db.String, nullable=True)
    time_in = db.Column(db.Time, nullable=False)
    time_out = db.Column(db.Time, nullable=False)
    date = db.Column(db.Date, nullable=False)
    notes = db.Column(db.String, nullable=True)

# Define the HomeworkTask model for the database
class HomeworkTask(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String, nullable=False)
    course = db.Column(db.String, nullable=False)
    task_name = db.Column(db.String, nullable=False)
    due_date = db.Column(db.Date, nullable=False)
    is_completed = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.now)

# Define the BreakEntry model for the database
class BreakEntry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String, nullable=False)
    time_in = db.Column(db.Time, nullable=False)
    time_out = db.Column(db.Time, nullable=False)
    date = db.Column(db.Date, nullable=False)

# Route for the login page
@app.route('/', methods=['GET', 'POST'])
def login():
    error = None
    success = None
    show_reset_form = request.args.get('forgot') == '1'
    
    # Check for flash messages
    flashed_messages = get_flashed_messages(with_categories=True)
    for category, message in flashed_messages:
        if category == 'success':
            success = message
        elif category == 'error':
            error = message
    
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')

        user = User.query.filter_by(username=username, password=password).first()

        if user:
            session['username'] = user.username
            return redirect(url_for('home', fullname=user.fullname))
        else:
            error = 'Invalid login credentials. Please try again.'

    return render_template('login.html', error=error, success=success, show_reset_form=show_reset_form)

# Route for password reset
@app.route('/reset_password', methods=['POST'])
def reset_password():
    error = None
    username = request.form.get('username')
    security_answer = request.form.get('security_answer')
    new_password = request.form.get('new_password')
    confirm_password = request.form.get('confirm_password')
    
    user = User.query.filter_by(username=username).first()
    
    if not user:
        error = 'Username not found.'
        return render_template('login.html', 
                             error=error, 
                             show_reset_form=True, 
                             username=username)
    
    # If security answer not provided yet, show the question
    if not security_answer:
        return render_template('login.html', 
                             show_reset_form=True, 
                             security_question=user.security_question,
                             username=username)
    
    # Verify security answer (case-insensitive)
    if security_answer.lower().strip() != user.security_answer:
        error = 'Incorrect security answer. Please try again.'
        return render_template('login.html', 
                             error=error, 
                             show_reset_form=True, 
                             security_question=user.security_question,
                             username=username)
    
    # Check if passwords match
    if new_password != confirm_password:
        error = 'Passwords do not match.'
        return render_template('login.html', 
                             error=error, 
                             show_reset_form=True, 
                             security_question=user.security_question,
                             username=username)
    
    # Update password
    user.password = new_password
    db.session.commit()
    
    # Redirect to login page with success message
    flash('Password reset successful! You can now login with your new password.', 'success')
    return redirect(url_for('login'))

# Route for the registration page
@app.route('/register', methods=['GET', 'POST'])
def register():
    error = None
    
    if request.method == 'POST':
        username = request.form.get('username')
        fullname = request.form.get('fullname')
        password = request.form.get('password')
        confirm_password = request.form.get('confirm_password')
        security_question = request.form.get('security_question')
        security_answer = request.form.get('security_answer')

        # Check if passwords match
        if password != confirm_password:
            error = 'Passwords do not match. Please try again.'
            return render_template('register.html', error=error)
        
        # Check if security answer is provided
        if not security_answer or len(security_answer.strip()) == 0:
            error = 'Please provide a security answer.'
            return render_template('register.html', error=error)
            
        existing_user = User.query.filter_by(username=username).first()
        
        # Check if new user can be created
        if existing_user:
            error = 'Username is already taken. Please choose a different username.'
        else:
            new_user = User(
                username=username, 
                fullname=fullname, 
                password=password, 
                security_question=security_question,
                security_answer=security_answer.lower().strip()
            )
            db.session.add(new_user)
            db.session.commit()

            session['username'] = new_user.username
            return redirect(url_for('login'))

    return render_template('register.html', error=error)

# Route for the home page
@app.route('/home')
def home():
    if session.get('username') == None:
        return redirect(url_for('login'))

    username = session.get('username')
    fullname = User.query.filter_by(username=username).first().fullname

    return render_template('home.html', username=username, fullname=fullname)

# Route for the study session page
@app.route('/session')
def study_session():
    if session.get('username') == None:
        return redirect(url_for('login'))

    return render_template('study_session.html')

# Route for saving the study session data
@app.route('/save_study_session', methods=['POST'])
def save_study_session():
    if request.method == 'POST':
        course = request.form.get('course')
        topic = request.form.get('topic')
        time_in_str = request.form.get('time_in')
        time_out_str = request.form.get('time_out')
        notes = request.form.get('notes')

        username = session['username']

        time_in = datetime.strptime(time_in_str, '%H:%M').time()
        time_out = datetime.strptime(time_out_str, '%H:%M').time()
        current_date = datetime.now().date()
        
        if time_in >= time_out:
            flash('The start time must be before the end time.', 'error')
            return redirect(url_for('study_session'))

        new_entry = StudySession(
            username=username, 
            course=course, 
            topic=topic,
            time_in=time_in, 
            time_out=time_out,
            date=current_date,
            notes=notes
        )

        db.session.add(new_entry)
        db.session.commit()

        return redirect(url_for('study_session'))

    return render_template('study_session.html')

# Route for the homework page
@app.route('/homework')
def homework():
    if session.get('username') == None:
        return redirect(url_for('login'))

    username = session['username']
    # Get incomplete tasks first, then completed tasks, ordered by due date
    incomplete_tasks = HomeworkTask.query.filter_by(username=username, is_completed=False).order_by(HomeworkTask.due_date).all()
    completed_tasks = HomeworkTask.query.filter_by(username=username, is_completed=True).order_by(HomeworkTask.due_date).all()
    
    # Combine them (incomplete first)
    tasks = incomplete_tasks + completed_tasks
    
    # Pass current date to template
    current_date = datetime.now().date()
    
    return render_template('homework.html', tasks=tasks, current_date=current_date)

# Route for saving new homework task
@app.route('/save_homework', methods=['POST'])
def save_homework():
    if request.method == 'POST':
        course = request.form.get('course')
        task_name = request.form.get('task_name')
        due_date_str = request.form.get('due_date')
        
        username = session['username']
        
        # Convert string to date
        due_date = datetime.strptime(due_date_str, '%Y-%m-%d').date()
        
        new_task = HomeworkTask(
            username=username,
            course=course,
            task_name=task_name,
            due_date=due_date
        )
        
        db.session.add(new_task)
        db.session.commit()
        
        return redirect(url_for('homework'))
    
    return redirect(url_for('homework'))

# Route for marking task as completed
@app.route('/complete_task/<int:task_id>')
def complete_task(task_id):
    if session.get('username') == None:
        return redirect(url_for('login'))
    
    task = HomeworkTask.query.get_or_404(task_id)
    
    # Only allow user to complete their own tasks
    if task.username == session['username']:
        task.is_completed = not task.is_completed  # Toggle completion status
        db.session.commit()
    
    return redirect(url_for('homework'))

# Route for deleting task
@app.route('/delete_task/<int:task_id>')
def delete_task(task_id):
    if session.get('username') == None:
        return redirect(url_for('login'))
    
    task = HomeworkTask.query.get_or_404(task_id)
    
    # Only allow user to delete their own tasks
    if task.username == session['username']:
        db.session.delete(task)
        db.session.commit()
    
    return redirect(url_for('homework'))

# Route for the break page
@app.route('/break')
def break_time():
    if session.get('username') == None:
        return redirect(url_for('login'))
    
    return render_template('break_time.html')

# Route for saving the break data
@app.route('/save_break', methods=['POST'])
def save_break():
    if request.method == 'POST':
        time_in_str = request.form.get('time_in')
        time_out_str = request.form.get('time_out')

        username = session['username']

        time_in = datetime.strptime(time_in_str, '%H:%M').time()
        time_out = datetime.strptime(time_out_str, '%H:%M').time()
        current_date = datetime.now().date()
        
        if time_in >= time_out:
            flash('The start time must be before the end time.', 'error')
            return redirect(url_for('break_time'))

        new_entry = BreakEntry(username=username, time_in=time_in, time_out=time_out, date=current_date)

        db.session.add(new_entry)
        db.session.commit()

        return redirect(url_for('break_time'))

    return render_template('break_time.html')

# Route for the notes page
@app.route('/notes')
def notes():
    if session.get('username') == None:
        return redirect(url_for('login'))
    
    username = session['username']
    # Get all study sessions with notes for this user, ordered by date (newest first)
    sessions_with_notes = StudySession.query.filter_by(username=username).filter(StudySession.notes != None).filter(StudySession.notes != '').order_by(StudySession.date.desc()).all()
    
    return render_template('notes.html', sessions=sessions_with_notes)

# Route for the study summary page
@app.route('/summary')
def study_summary():
    current_date = datetime.now()

    current_username = session.get('username')
    
    if current_username == None:
        return redirect(url_for('login'))

    all_users = User.query.all()

    current_user = None
    for user in all_users:
        if user.username == current_username:
            current_user = user
            break

    if current_user:
        all_users.remove(current_user)

    if current_user:
        all_users.insert(0, current_user)

    all_study_session_data = []
    all_break_data = []

    for user in all_users:
        study_session_data = StudySession.query.filter_by(username=user.username).all()
        all_study_session_data.append(study_session_data)

        break_data = BreakEntry.query.filter_by(username=user.username).all()
        all_break_data.append(break_data)

    return render_template('study_summary.html', current_date=current_date, all_users=all_users, 
                         all_study_session_data=all_study_session_data, all_break_data=all_break_data)

# Main block to run the application
if __name__ == '__main__':
    with app.app_context():
        db.drop_all()
        db.create_all()
        app.run(debug=True)