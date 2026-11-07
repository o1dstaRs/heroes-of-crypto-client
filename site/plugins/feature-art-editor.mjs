import { readFile, writeFile, rename } from 'node:fs/promises';
const configUrl = new URL('../src/data/feature-art.json', import.meta.url);
const rosterUrl = new URL('../src/data/feature-roster.json', import.meta.url);

export function validateFeatureArt(value, roster) {
    if (!value || !Number.isInteger(value.spellVariant) || value.spellVariant < 0 || value.spellVariant > 6 || !Array.isArray(value.slots) || value.slots.length !== 4) throw new Error('Некорректная конфигурация');
    return { spellVariant: value.spellVariant, slots: roster.map((group, index) => {
        const slot = value.slots[index];
        if (!slot || slot.faction !== group.faction || !group.units.some(unit => unit.slug === slot.creature) || typeof slot.flip !== 'boolean') throw new Error('Существо не принадлежит фракции');
        for (const [key, min, max] of [['x', -150, 150], ['y', -150, 150], ['scale', 0.25, 4]]) {
            if (!Number.isFinite(slot[key]) || slot[key] < min || slot[key] > max) throw new Error('Положение или масштаб вне допустимого диапазона');
        }
        return { faction: group.faction, creature: slot.creature, x: slot.x, y: slot.y, scale: slot.scale, flip: slot.flip };
    }) };
}

// configureServer is only called by Vite's development server. No production endpoint is emitted.
export default function featureArtEditor() {
    return { name: 'local-feature-art-editor', configureServer(server) {
        server.middlewares.use('/__dev/feature-art', async (req, res) => {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            try {
                const host = req.headers.host || '';
                if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) || (req.headers.origin && new URL(req.headers.origin).host !== host)) {
                    res.statusCode = 403; res.end(JSON.stringify({ error: 'Только локальный редактор' })); return;
                }
                if (req.method === 'GET') { res.end(await readFile(configUrl, 'utf8')); return; }
                if (req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) {
                    res.statusCode = 405; res.end(JSON.stringify({ error: 'Ожидается POST JSON' })); return;
                }
                let body = '';
                for await (const chunk of req) { body += chunk; if (body.length > 8192) throw new Error('Слишком большой запрос'); }
                const config = validateFeatureArt(JSON.parse(body), JSON.parse(await readFile(rosterUrl, 'utf8')));
                const temp = new URL(configUrl.href + '.tmp');
                await writeFile(temp, JSON.stringify(config, null, 2) + '\n');
                await rename(temp, configUrl);
                res.end(JSON.stringify({ ok: true }));
            } catch (error) { res.statusCode = 400; res.end(JSON.stringify({ error: error.message })); }
        });
    } };
}
