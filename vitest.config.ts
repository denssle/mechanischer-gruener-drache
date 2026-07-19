import {defineConfig} from 'vitest/config';

// Ohne diese Eingrenzung sammelt vitest lokal auch die nach dist/ kompilierten Tests ein
// (dort liegt nach einem `npm run build` von jeder *.test.ts eine *.test.js) und führt die
// Suite doppelt aus - einmal gegen den aktuellen Quellcode, einmal gegen den Stand des
// letzten Builds. In der CI fällt das nicht auf, weil `npm test` dort vor `npm run build`
// läuft und dist/ noch leer ist.
export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        // coverage.include sorgt dafür, dass auch nie importierte Quelldateien im Bericht
        // auftauchen (mit 0 %) - sonst wären genau die ungetesteten Dateien unsichtbar.
        coverage: {
            include: ['src/**/*.ts'],
            exclude: ['src/**/*.test.ts', 'src/types/**'],
        },
    },
});
