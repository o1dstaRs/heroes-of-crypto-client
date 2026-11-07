import { expect, test } from 'bun:test';
import { FEATURE_CARD_ROSTER, resolveFeatureCardUnit } from './feature-card-roster';

test('feature images resolve only within their bundled faction roster', () => {
    const unit = FEATURE_CARD_ROSTER[0].units[0];
    expect(resolveFeatureCardUnit(0, unit.slug)).toEqual(unit);
    expect(resolveFeatureCardUnit(-1, unit.slug)).toBeUndefined();
    expect(resolveFeatureCardUnit(100, unit.slug)).toBeUndefined();
    expect(resolveFeatureCardUnit(0, FEATURE_CARD_ROSTER[1].units[0].slug)).toBeUndefined();
});

test('DOM-supplied URLs, markup and objects cannot replace a portrait source', () => {
    for (const value of ['javascript:alert(1)', '<img src=x onerror=alert(1)>', '__proto__', { src: 'data:text/html,test' }]) {
        expect(resolveFeatureCardUnit(0, value)).toBeUndefined();
    }
});
