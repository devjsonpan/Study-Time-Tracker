document.addEventListener("DOMContentLoaded", function () {
    let mainContent = document.querySelector('.main-content');
    if (!mainContent) return;

    function attachListeners() {
        let actionButtons = document.querySelectorAll('.action-button');
        actionButtons.forEach(button => {
            // Only add listener if we haven't already (prevent duplicates)
            if (!button.dataset.listenerAttached) {
                button.dataset.listenerAttached = 'true';

                button.addEventListener('click', function (e) {
                    e.preventDefault(); // Stop the link from redirecting the page

                    let url = this.getAttribute('href');

                    if (this.classList.contains('delete-button')) {
                        // For delete task, check confirm directly
                        if (!confirm('Are you sure you want to delete this task?')) {
                            return;
                        }
                    }

                    // Save exact scroll
                    let currentScroll = mainContent.scrollTop;

                    fetch(url)
                        .then(response => response.text())
                        .then(html => {
                            let parser = new DOMParser();
                            let doc = parser.parseFromString(html, 'text/html');

                            // Swap out only the tasks portion so there is NO reload blink!
                            let newList = doc.querySelector('.homework-list');
                            let currentList = document.querySelector('.homework-list');
                            if (newList && currentList) {
                                currentList.innerHTML = newList.innerHTML;
                            }

                            // Attach listeners to the newly created buttons
                            attachListeners();

                            // Restore scroll perfectly
                            mainContent.scrollTop = currentScroll;
                        });
                });
            }
        });
    }

    attachListeners();
});