const SchoolYears = (() => {
  const key = 'haruban-school-years-v1';
  const legacyKey = 'haruban-classroom-v1';
  const validYear = year => Number.isInteger(year) && year >= 1900 && year <= 2200;

  function read(storage) {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const data = JSON.parse(raw);
    if (!isArchive(data)) throw new Error('invalid archive');
    return data;
  }

  function isArchive(data) {
    if (!data || data.format !== 'haruban-school-years' || data.version !== 1 ||
        !validYear(data.activeYear) || !data.years || Array.isArray(data.years) ||
        typeof data.years !== 'object') return false;
    return Object.entries(data.years).every(([year, records]) =>
      validYear(Number(year)) && String(Number(year)) === year &&
      records && records.schoolYear === Number(year)) &&
      Object.hasOwn(data.years, data.activeYear);
  }

  function open(storage, makeSample) {
    const current = read(storage);
    if (current) return current;
    const raw = storage.getItem(legacyKey);
    const records = raw === null ? makeSample() : JSON.parse(raw);
    const year = validYear(records.schoolYear) ? records.schoolYear : new Date().getFullYear();
    return {
      format: 'haruban-school-years',
      version: 1,
      activeYear: year,
      years: { [year]: { ...records, schoolYear: year } }
    };
  }

  function write(storage, archive) {
    storage.setItem(key, JSON.stringify(archive));
    return archive;
  }

  return { open, read, write, isArchive, validYear };
})();
