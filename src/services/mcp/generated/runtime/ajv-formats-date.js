/* Vendored from ajv-formats@3.0.1 dist/formats.js (date helpers). Do not edit. */
/* License: LICENSES/ajv-formats-MIT.txt */
function isLeapYear(year) {
    // https://tools.ietf.org/html/rfc3339#appendix-C
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
const DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
const DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function date(str) {
    // full-date from http://tools.ietf.org/html/rfc3339#section-5.6
    const matches = DATE.exec(str);
    if (!matches)
        return false;
    const year = +matches[1];
    const month = +matches[2];
    const day = +matches[3];
    return (month >= 1 &&
        month <= 12 &&
        day >= 1 &&
        day <= (month === 2 && isLeapYear(year) ? 29 : DAYS[month]));
}
function compareDate(d1, d2) {
    if (!(d1 && d2))
        return undefined;
    if (d1 > d2)
        return 1;
    if (d1 < d2)
        return -1;
    return 0;
}
export const fullFormatsDate = { validate: date, compare: compareDate };
