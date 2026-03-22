// Updated to support optional query parameter via command-line
(async () => {
  const urlBase = 'http://localhost:3000';
  const setsUrl = `${urlBase}/api/sets`;
  const setArg = process.argv[2];
  try {
    const res = await fetch(setArg ? `${urlBase}/api/cards?set=${encodeURIComponent(setArg)}` : setsUrl);
    const text = await res.text();
    console.log('STATUS', res.status);
    console.log(text);
  } catch (e) {
    console.error('ERROR', e);
  }
})();
