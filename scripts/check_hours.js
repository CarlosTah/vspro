const businessHours = {
  lunes: { enabled: false },
  jueves: { open: '04:00' },
  martes: { open: '05:00' },
  domingo: { open: '08:00', close: '00:00', enabled: true },
  sábado: { open: '04:00', close: '01:00', enabled: true },
  schedule: {
    fri: { open: '06:00', close: '00:00' },
    mon: { open: '06:00', close: '00:00' },
    sat: { open: '04:00', close: '01:00' },
    sun: { open: '08:00', close: '00:00' },
    thu: { open: '06:00', close: '00:00' },
    tue: { open: '05:00', close: '00:00' },
    wed: { open: '06:00', close: '00:00' },
  },
  timezone: 'America/Cancun',
};

let timezone = businessHours.timezone || 'America/Mexico_City';
let schedule = businessHours.schedule || businessHours;

const spanishToKey = {
  lunes: 'mon',
  martes: 'tue',
  miércoles: 'wed',
  miercoles: 'wed',
  jueves: 'thu',
  viernes: 'fri',
  sábado: 'sat',
  sabado: 'sat',
  domingo: 'sun',
};
for (const [spanishDay, engKey] of Object.entries(spanishToKey)) {
  const dashEntry = businessHours[spanishDay];
  if (dashEntry && typeof dashEntry === 'object') {
    if (dashEntry.enabled === false) {
      schedule[engKey] = null;
    } else if (dashEntry.open || dashEntry.close) {
      const existing = schedule[engKey] || {};
      schedule[engKey] = {
        open: dashEntry.open || existing.open || '08:00',
        close: dashEntry.close || existing.close || '00:00',
      };
    }
  }
}

const now = new Date();
const options = { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false };
const dayOptions = { timeZone: timezone, weekday: 'short' };
const currentTime = new Intl.DateTimeFormat('en-US', options).format(now);
const currentDay = new Intl.DateTimeFormat('en-US', dayOptions).format(now).toLowerCase();

console.log('currentDay:', currentDay, 'currentTime:', currentTime);

const dayMap = {
  mon: 'mon',
  tue: 'tue',
  wed: 'wed',
  thu: 'thu',
  fri: 'fri',
  sat: 'sat',
  sun: 'sun',
};
const dayKey = dayMap[currentDay] || currentDay;
const todayHours = schedule[dayKey];
console.log('dayKey:', dayKey, 'todayHours:', JSON.stringify(todayHours));

if (!todayHours || !todayHours.open || !todayHours.close) {
  console.log('RESULT: CLOSED (no hours for today)');
} else {
  const [currentH, currentM] = currentTime.split(':').map(Number);
  const currentMinutes = currentH * 60 + currentM;
  const [openH, openM] = todayHours.open.split(':').map(Number);
  const openMinutes = openH * 60 + openM;
  const [closeH, closeM] = todayHours.close.split(':').map(Number);
  let closeMinutes = closeH * 60 + closeM;
  if (closeMinutes === 0 || closeMinutes <= openMinutes) closeMinutes = 24 * 60;
  console.log('currentMin:', currentMinutes, 'openMin:', openMinutes, 'closeMin:', closeMinutes);
  console.log(
    'RESULT:',
    currentMinutes >= openMinutes && currentMinutes < closeMinutes ? 'OPEN' : 'CLOSED',
  );
}
