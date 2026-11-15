// Builds the PDFs used by the E2E test (run from the repo root: node tests/e2e/make_fixtures.mjs).
import { jsPDF } from 'jspdf';
import fs from 'fs';
const out = new URL('./fixtures/', import.meta.url).pathname;
const doc = new jsPDF();
doc.text('Quarterly report on solar energy adoption in coastal regions.', 10, 20);
doc.text('Installed capacity grew steadily throughout the year.', 10, 30);
doc.addPage(); doc.text('Page two discusses battery storage and grid stability concerns.', 10, 20);
doc.addPage(); doc.text('The zeppelin budget for the northern pilot was 7.3 million euros.', 10, 20);
fs.writeFileSync(out + 'report.pdf', Buffer.from(doc.output('arraybuffer')));
const wind = new jsPDF();
wind.text('A second source about wind turbines and offshore farms in the north sea.', 10, 20);
fs.writeFileSync(out + 'wind.pdf', Buffer.from(wind.output('arraybuffer')));
fs.writeFileSync(out + 'broken.pdf', 'not really a pdf');
console.log('fixtures written to', out);
