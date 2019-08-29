function detectionTime(errorThreshold, time, errorRate) {
    const value = errorThreshold * time / errorRate;
    if (value < time) {
        return value;
    }

    return -1;
}

function exhaustionTime(errorRate, errorBudget, sloWindow) {
    const exhaustion = (sloWindow * 24 * 60) / (errorRate / errorBudget);
    if (exhaustion > (sloWindow * 24 * 60)) {
        return -1;
    }
    return exhaustion;
}

function formatDuration(value) {
    const rawMinutes = value;
    const seconds = Math.floor(rawMinutes * 60) % 60;
    const roundMinutes = Math.floor(rawMinutes);
    const minutes = roundMinutes % 60;
    const roundHours = Math.floor(roundMinutes / 60);
    const hours = roundHours % 24;
    const days = Math.floor(roundHours / 24);
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function calculateTimings(errorThresholds, errorRate, errorBudget, sloWindow) {
    const detectionTime1h = detectionTime(errorThresholds['1h'], (60 * 1), errorRate);
    const detectionTime6h = detectionTime(errorThresholds['6h'], (60 * 6), errorRate);
    const detectionTime3d = detectionTime(errorThresholds['3d'], (60 * 24 * 3), errorRate);

    let detectionPage = -1;
    if (detectionTime1h < detectionTime6h && detectionTime1h > -1) {
        detectionPage = detectionTime1h;
    } else if (detectionTime6h > -1) {
        detectionPage = detectionTime6h;
    }

    let detectionTicket = -1;

    if (detectionPage === -1) {
        if (detectionTime3d > -1) {
            detectionTicket = detectionTime3d;
        }
    }
    const exhausted = exhaustionTime(errorRate, errorBudget, sloWindow);
    return {detectionPage, detectionTicket, exhausted};
}

class MultipleBurnRateCalculator {
    constructor() {
        this.form = document.getElementsByTagName('form')[0];

        this.form.addEventListener('input', this.recalculateBudgetConsumption.bind(this));

        this.recalculateBudgetConsumption();
    }

    recalculateBudgetConsumption() {
        const slo = parseFloat(this.form.querySelector('#slo').value);
        const sloWindow = parseFloat(this.form.querySelector('#slo_window').value);
        const errorBudget = 1 - (slo/100);
        const errorThresholds = {};

        for (const humanTime of ['1h', '6h', '3d']) {
            const burnRate = parseFloat(this.form.querySelector(`#burn_rate_${humanTime}`).value);

            let [time, kind] = humanTime.split('');
            time = parseInt(time);

            if (kind === 'd') {
                time = time * 24;
            }

            const budgetConsumption = (burnRate * time) / (sloWindow * 24);
            errorThresholds[humanTime] = burnRate * errorBudget;
            this.form.querySelector(`#budget_consumption_${humanTime}`).textContent = budgetConsumption;
        }

        this.drawDetectionTime(errorThresholds, errorBudget, sloWindow);
    }

    drawDetectionTime(errorThresholds, errorBudget, sloWindow) {
        console.info(errorThresholds, errorBudget);

        const startLog = 0.995;
        const pagePoints = [];
        const ticketPoints = [];
        const exhaustionPoints = [];

        for (let i = 0; i<1100; i++) {
            const errorRate = Math.pow(startLog, i * 2);

            let {
                detectionPage,
                detectionTicket,
                exhausted
            } = calculateTimings(errorThresholds, errorRate, errorBudget, sloWindow);

            ticketPoints.push([errorRate, detectionTicket]);

            pagePoints.push([errorRate, detectionPage]);

            exhaustionPoints.push([errorRate, exhausted])
        }
        Highcharts.chart('detection_time', {
            title: {
                text: '',
            },
            yAxis: {
                type: 'logarithmic',
                minorTickInterval: 0.1,
                title: {
                    text: 'Time',
                },
                labels:{
                    formatter: (event) => {
                        return formatDuration(event.value);
                    }
                }
            },

            tooltip: {
                pointFormatter: function(event)  {
                    const {
                        detectionPage,
                        detectionTicket,
                        exhausted
                    } = calculateTimings(errorThresholds, this.x, errorBudget, sloWindow);
                    const detectionTime = formatDuration(Math.max(detectionPage, detectionTicket));
                    const exhaustedTime = formatDuration(exhausted);
                    return `Error rate: ${this.x * 100}%<br/>Detected: ${detectionTime}<br />Exhausted: ${exhaustedTime}` ;
                },
            },
            xAxis: {
                type: 'logarithmic',
                title: {
                    text: 'Error rate',
                },
                labels:{
                    formatter: (event) => {
                        return (event.value * 100) + '%';
                    }
                }
            },

            legend: {
                layout: 'vertical',
                align: 'right',
                verticalAlign: 'middle'
            },

            plotOptions: {
                series: {
                    label: {
                        connectorAllowed: false
                    },
                    pointStart: 0,
                }
            },

            series: [{
                name: 'Ticket',
                data: ticketPoints,
            }, {
                name: 'Page',
                data: pagePoints,
            }, {
                name: 'Exhaustion',
                data: exhaustionPoints,
            }],
        });
    }
}

new MultipleBurnRateCalculator();
