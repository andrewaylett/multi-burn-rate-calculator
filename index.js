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

function calculateTimings(errorThresholds, errorRate, errorBudget, sloWindow, h1, h6, d3) {
    const detectionTime1h = detectionTime(errorThresholds['1h'], (60 * h1), errorRate);
    const detectionTime6h = detectionTime(errorThresholds['6h'], (60 * h6), errorRate);
    const detectionTime3d = detectionTime(errorThresholds['3d'], (60 * d3), errorRate);
    let detected = Number.MAX_VALUE;

    let detectionPage1h = -1;
    if (detectionTime1h > -1) {
        detectionPage1h = detectionTime1h;
        detected = detectionTime1h < detected ? detectionTime1h : detected;
    }
    let detectionPage6h = -1;
    if (detectionTime6h > -1) {
        detectionPage6h = detectionTime6h;
        detected = detectionTime6h < detected ? detectionTime6h : detected;
    }

    let detectionTicket = -1;
    if (detectionTime3d > -1) {
        detectionTicket = detectionTime3d;
        detected = detectionTime3d < detected ? detectionTime3d : detected;
    }

    const exhausted = exhaustionTime(errorRate, errorBudget, sloWindow);
    return {detectionPage1h, detectionPage6h, detectionTicket, exhausted, detected};
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
        const durations = {};

        for (const humanTime of ['1h', '6h', '3d']) {
            const burnRate = parseFloat(this.form.querySelector(`#burn_rate_${humanTime}`).value);

            let [time, kind] = humanTime.split('');
            time = parseFloat(this.form.querySelector(`#burn_duration_${humanTime}`).value)

            if (kind === 'd') {
                time = time * 24;
            }

            durations[humanTime] = time;

            const budgetConsumption = (burnRate * time) / (sloWindow * 24);
            errorThresholds[humanTime] = burnRate * errorBudget;
            this.form.querySelector(`#budget_consumption_${humanTime}`).textContent = `${(budgetConsumption*100).toPrecision(3)}%`;
        }

        this.drawDetectionTime(errorThresholds, errorBudget, sloWindow, durations['1h'], durations['6h'], durations['3d']);
    }

    drawDetectionTime(errorThresholds, errorBudget, sloWindow, h1, h6, d3) {
        console.info(errorThresholds, errorBudget);

        const startLog = 0.995;
        const page1hPoints = [];
        const page6hPoints = [];
        const ticketPoints = [];
        const exhaustionPoints = [];

        for (let i = 0; i<1100; i++) {
            const errorRate = Math.pow(startLog, i * 2);

            if (errorRate < errorBudget) {
                break;
            }

            let {
                detectionPage1h,
                detectionPage6h,
                detectionTicket,
                exhausted
            } = calculateTimings(errorThresholds, errorRate, errorBudget, sloWindow, h1, h6, d3);

            ticketPoints.unshift([errorRate, detectionTicket]);

            page1hPoints.unshift([errorRate, detectionPage1h]);
            page6hPoints.unshift([errorRate, detectionPage6h]);

            exhaustionPoints.unshift([errorRate, exhausted])
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
                        detected,
                        exhausted
                    } = calculateTimings(errorThresholds, this.x, errorBudget, sloWindow, h1, h6, d3);
                    const detectionTime = formatDuration(detected);
                    const exhaustedTime = formatDuration(exhausted);
                    const responseTime = formatDuration(exhausted - detected)
                    return `Error rate: ${(this.x * 100).toPrecision(4)}%<br/>Detected: ${detectionTime}<br />Exhausted: ${exhaustedTime}<br />Response Time: ${responseTime}` ;
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
                name: `Page ${h6}h`,
                data: page6hPoints,
            }, {
                name: `Page ${h1}h`,
                data: page1hPoints,
            }, {
                name: 'Exhaustion',
                data: exhaustionPoints,
            }],
        });
    }
}

new MultipleBurnRateCalculator();
