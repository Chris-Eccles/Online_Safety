/**
 * Regenerates the list on sources.html from data/sources.json.
 * Run:  node scripts/build-sources.js
 * Only the part between the SOURCES:START / SOURCES:END markers is replaced.
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data', 'sources.json'), 'utf8'));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const statRows = data.stats.map(s =>
  '        <tr>' +
  '<td><strong>' + esc(s.figure) + '</strong></td>' +
  '<td>' + esc(s.claim) + '</td>' +
  '<td>' + esc(s.publisher) + ', <a href="' + esc(s.url) + '" rel="noopener">' + esc(s.title) + '</a> (' + esc(s.year) + ')</td>' +
  '<td>' + esc(s.where) + '</td>' +
  '</tr>'
).join('\n');

const refItems = data.references.map(r =>
  '      <li><strong>' + esc(r.topic) + ':</strong> <a href="' + esc(r.url) + '" rel="noopener">' + esc(r.title) + '</a>, ' + esc(r.publisher) + '</li>'
).join('\n');

const html = `<!-- SOURCES:START -->
    <h2>Statistics</h2>
    <p>Every number we show students and visitors, where it comes from, and where it is used. Figures were last checked on ${esc(data.checked)}.</p>
    <div style="overflow-x:auto;">
      <table class="map-table">
        <thead><tr><th scope="col">Figure</th><th scope="col">What it measures</th><th scope="col">Source</th><th scope="col">Where we use it</th></tr></thead>
        <tbody>
${statRows}
        </tbody>
      </table>
    </div>
    <h2>The law, guidance and where to get help</h2>
    <ul>
${refItems}
    </ul>
<!-- SOURCES:END -->`;

const file = path.join(root, 'sources.html');
let page = fs.readFileSync(file, 'utf8');
page = page.replace(/<!-- SOURCES:START -->[\s\S]*<!-- SOURCES:END -->/, () => html);
fs.writeFileSync(file, page);
console.log('sources.html updated: ' + data.stats.length + ' statistics, ' + data.references.length + ' references');
