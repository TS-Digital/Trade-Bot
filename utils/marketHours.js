/**
 * Forex market hours helper.
 *
 * GBP pairs are only liquid during London + NY overlap:
 * Monday–Friday, 07:00–22:00 UTC.
 */

function isForexOpen() {
  const now  = new Date();
  const day  = now.getUTCDay();   // 0 = Sun, 6 = Sat
  const hour = now.getUTCHours();
  return day >= 1 && day <= 5 && hour >= 7 && hour < 22;
}

module.exports = { isForexOpen };
