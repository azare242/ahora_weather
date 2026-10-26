// Approximate city-center coordinates (latitude, longitude).
const cities = [
    ['tehran', 35.6892, 51.3890, ['تهران']],
    ['mashhad', 36.2605, 59.6168, ['مشهد']],
    ['isfahan', 32.6546, 51.6680, ['esfahan', 'اصفهان']],
    ['shiraz', 29.5918, 52.5837, ['شیراز']],
    ['tabriz', 38.0800, 46.2919, ['تبریز']],
    ['karaj', 35.8400, 50.9391, ['کرج']],
    ['qom', 34.6416, 50.8746, ['قم']],
    ['ahvaz', 31.3183, 48.6706, ['ahwaz', 'اهواز']],
    ['kermanshah', 34.3142, 47.0650, ['کرمانشاه']],
    ['urmia', 37.5527, 45.0761, ['orumiyeh', 'urumieh', 'ارومیه']],
    ['rasht', 37.2808, 49.5832, ['رشت']],
    ['zahedan', 29.4963, 60.8629, ['زاهدان']],
    ['hamadan', 34.7989, 48.5150, ['hamedan', 'همدان']],
    ['kerman', 30.2839, 57.0834, ['کرمان']],
    ['yazd', 31.8974, 54.3569, ['یزد']],
    ['ardabil', 38.2498, 48.2933, ['ardebil', 'اردبیل']],
    ['bandar-abbas', 27.1832, 56.2666, ['bandar abbas', 'بندرعباس', 'بندر عباس']],
    ['arak', 34.0917, 49.6892, ['اراک']],
    ['qazvin', 36.2688, 50.0041, ['ghazvin', 'قزوین']],
    ['zanjan', 36.6736, 48.4787, ['زنجان']],
].map(([name, lat, lon, aliases]) => ({name, lat, lon, aliases}));

function normalizeCity(input) {
    if (typeof input !== 'string') return '';
    return input.normalize('NFKC').toLowerCase()
        .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
        .replace(/[\s_\-\u200c\u200d]+/g, '');
}

const lookup = new Map(cities.flatMap(city =>
    [city.name, ...city.aliases].map(alias => [normalizeCity(alias), city])
));

module.exports = {
    cities,
    resolveCity: input => lookup.get(normalizeCity(input)),
};
