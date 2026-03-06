// Tab switching
function switchTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelector(`[onclick="switchTab('${name}')"]`).classList.add('active');
    document.getElementById('tab-' + name).classList.add('active');
}

function generateColors(count) {
    const colors = [];
    for (let i = 0; i < count; i++) {
        const hue = (i * 137.5) % 360; // golden angle spread — keeps colors distinct
        colors.push(`hsl(${hue}, 65%, 60%)`);
    }
    return colors;
}

document.addEventListener("DOMContentLoaded", function () {
    Chart.defaults.font.family = 'Arial, sans-serif';
    Chart.defaults.color = '#4a5568';

    // Study hours bar
    new Chart(document.getElementById('studyChart'), {
        type: 'bar',
        data: {
            labels: friendNames,
            datasets: [{
                label: 'Hours Studied',
                data: friendStudy,
                backgroundColor: '#667eea',
                borderRadius: 8,
                borderSkipped: false,
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                x: { beginAtZero: true, grid: { color: '#e2e8f0' }, ticks: { callback: v => v + 'h' } },
                y: { grid: { display: false } }
            }
        }
    });

    // Break hours bar
    new Chart(document.getElementById('breakChart'), {
        type: 'bar',
        data: {
            labels: friendNames,
            datasets: [{
                label: 'Break Hours',
                data: friendBreak,
                backgroundColor: '#f6ad55',
                borderRadius: 8,
                borderSkipped: false,
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                x: { beginAtZero: true, grid: { color: '#e2e8f0' }, ticks: { callback: v => v + 'h' } },
                y: { grid: { display: false } }
            }
        }
    });

    // Course donut
    if (courseLabels.length > 0) {
        new Chart(document.getElementById('courseChart'), {
            type: 'doughnut',
            data: {
                labels: courseLabels,
                datasets: [{
                    data: courseHours,
                    backgroundColor: generateColors(courseLabels.length),
                    borderWidth: 2,
                    borderColor: '#fff',
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom', labels: { padding: 15 } },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw}h` } }
                },
                cutout: '65%',
            }
        });

        // Daily bar
        new Chart(document.getElementById('dailyChart'), {
            type: 'bar',
            data: {
                labels: dailyLabels,
                datasets: [
                    {
                        label: 'Study',
                        data: dailyStudy,
                        backgroundColor: '#667eea',
                        borderRadius: 6,
                        borderSkipped: false,
                    },
                    {
                        label: 'Break',
                        data: dailyBreak,
                        backgroundColor: '#f6ad55',
                        borderRadius: 6,
                        borderSkipped: false,
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'bottom' } },
                scales: {
                    x: { grid: { display: false } },
                    y: { beginAtZero: true, grid: { color: '#e2e8f0' }, ticks: { callback: v => v + 'h' } }
                }
            }
        });
    }
});