document.addEventListener("DOMContentLoaded", function () {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const timerDisplay = document.getElementById('timerDisplay');
    const timerStatus = document.getElementById('timerStatus');
    const form = document.querySelector('.break-form');

    // Hidden inputs
    const timeInInput = document.getElementById('time_in');
    const timeOutInput = document.getElementById('time_out');

    let startTime = null;
    let timerInterval = null;

    // Helper to format Date cleanly to HH:MM:SS
    function formatTimeString(dateObj) {
        let hours = dateObj.getHours().toString().padStart(2, '0');
        let minutes = dateObj.getMinutes().toString().padStart(2, '0');
        let seconds = dateObj.getSeconds().toString().padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    // Helper to calculate duration in HH:MM:SS from ms
    function updateDisplay(diffMs) {
        let totalSeconds = Math.floor(diffMs / 1000);
        let hours = Math.floor(totalSeconds / 3600);
        let minutes = Math.floor((totalSeconds % 3600) / 60);
        let seconds = totalSeconds % 60;

        timerDisplay.textContent =
            hours.toString().padStart(2, '0') + ':' +
            minutes.toString().padStart(2, '0') + ':' +
            seconds.toString().padStart(2, '0');
    }

    // Checking if we already have an active break session stored in localStorage
    // (This allows the user to navigate away and come back, and the timer will still be perfectly accurate)
    let savedSession = localStorage.getItem('activeBreakStart');
    if (savedSession) {
        startTime = new Date(parseInt(savedSession));

        // Start visuals immediately
        timerDisplay.classList.add('active');
        timerStatus.textContent = "Break in progress...";
        startBtn.style.display = 'none';
        stopBtn.style.display = 'inline-block';

        timerInterval = setInterval(() => {
            updateDisplay(new Date() - startTime);
        }, 1000);
        updateDisplay(new Date() - startTime);
    }


    startBtn.addEventListener('click', function () {
        startTime = new Date();
        localStorage.setItem('activeBreakStart', startTime.getTime());

        timerDisplay.classList.add('active');
        timerStatus.textContent = "Break in progress...";
        startBtn.style.display = 'none';
        stopBtn.style.display = 'inline-block';

        // Update display every second
        timerInterval = setInterval(() => {
            updateDisplay(new Date() - startTime);
        }, 1000);
        updateDisplay(0);
    });

    stopBtn.addEventListener('click', function () {
        if (!startTime) return;

        clearInterval(timerInterval);
        const endTime = new Date();

        // Stop visuals
        timerDisplay.classList.remove('active');
        localStorage.removeItem('activeBreakStart');

        // Check if the break was too short (under 1 minute)
        let diffMs = endTime - startTime;
        if (diffMs < 60000) {
            alert('Break was less than a minute, so no time was logged.');
            timerStatus.textContent = "Ready to take a break?";
            startBtn.style.display = 'inline-block';
            stopBtn.style.display = 'none';
            timerDisplay.textContent = "00:00:00";
            startTime = null;
            return;
        }

        // Send to Flask!
        timerStatus.textContent = "Saving break...";
        stopBtn.disabled = true;

        timeInInput.value = formatTimeString(startTime);
        timeOutInput.value = formatTimeString(endTime);

        form.submit();
    });
});
