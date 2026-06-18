import { calculateOverallLeaderboard } from "./championshipDayEngine.js";

const EXCEL_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EXCEL_EPOCH_OFFSET = 25569;
const BASELINE_WIN_POINTS = 5;

export function championshipDashboardFilename(championship, now = new Date()) {
  const date = championshipDate(championship, now);
  const day = pad2(date.getUTCDate());
  const month = pad2(date.getUTCMonth() + 1);
  const year = String(date.getUTCFullYear()).slice(-2);

  return `championship-dashboard-${day}-${month}.${year}.xlsx`;
}

export function championshipDashboardRows(championship, now = new Date()) {
  const date = championshipDate(championship, now);
  const dateLabel = formatDateLabel(date);

  return calculateOverallLeaderboard(championship).map((player) => {
    const fourthPlaces = Number(player.fourthPlaces ?? 0);
    const gamesPlayed = Number(player.normalWins ?? 0)
      + Number(player.lockWins ?? 0)
      + Number(player.secondPlaces ?? 0)
      + Number(player.thirdPlaces ?? 0)
      + fourthPlaces;

    return {
      playerName: player.playerName,
      date: dateLabel,
      dateSerial: excelDateSerial(date),
      placing: player.rank,
      totalPoints: player.totalPoints,
      gamesPlayed,
      normalWins: player.normalWins,
      lockWins: player.lockWins,
      normalLosses: fourthPlaces,
      lockLoses: player.lockLoses,
      winPercentage: gamesPlayed ? ((Number(player.normalWins ?? 0) + Number(player.lockWins ?? 0)) / gamesPlayed) * 100 : 0
    };
  });
}

export function buildChampionshipDashboardWorkbook(championship, options = {}) {
  const now = options.now ?? new Date();
  const rows = championshipDashboardRows(championship, now);
  const filename = championshipDashboardFilename(championship, now);
  const titleDate = formatLongDate(championshipDate(championship, now));
  const title = `${championship.name || "Championship"} - ${titleDate} - ${rows[0]?.gamesPlayed ?? 0} Game ${championship.players?.length ?? rows.length} Players Championship`;
  const sheetXml = buildSheetXml(title, rows);
  const workbook = createZip([
    ["[Content_Types].xml", contentTypesXml()],
    ["_rels/.rels", rootRelsXml()],
    ["docProps/app.xml", appPropsXml()],
    ["docProps/core.xml", corePropsXml(now)],
    ["xl/workbook.xml", workbookXml()],
    ["xl/_rels/workbook.xml.rels", workbookRelsXml()],
    ["xl/styles.xml", stylesXml()],
    ["xl/worksheets/sheet1.xml", sheetXml]
  ]);

  return {
    filename,
    contentType: EXCEL_MIME_TYPE,
    buffer: workbook
  };
}

function buildSheetXml(title, rows) {
  const maxRow = Math.max(16, rows.length + 3);
  const bodyRows = rows.map((row, index) => dashboardDataRow(row, index + 3)).join("");
  const totalsRow = 3 + rows.length;
  const noteRow = totalsRow + 1;

  return xmlDeclaration(`\
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:K${maxRow}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultColWidth="14.42" defaultRowHeight="15"/>
  <cols>
    <col min="1" max="1" width="18.14" customWidth="1"/>
    <col min="2" max="2" width="11.85" customWidth="1"/>
    <col min="3" max="3" width="11.85" customWidth="1"/>
    <col min="4" max="4" width="16.85" customWidth="1"/>
    <col min="5" max="5" width="14.57" customWidth="1"/>
    <col min="6" max="6" width="14.85" customWidth="1"/>
    <col min="7" max="7" width="16.57" customWidth="1"/>
    <col min="8" max="8" width="17.14" customWidth="1"/>
    <col min="9" max="9" width="16.28" customWidth="1"/>
    <col min="10" max="10" width="10" customWidth="1"/>
    <col min="11" max="11" width="14.2" customWidth="1"/>
  </cols>
  <sheetData>
    <row r="1" ht="23.25" customHeight="1">
      ${inlineCell("A1", title, 1)}
      ${blankStyledCells(["B1", "C1", "D1", "E1", "F1", "G1", "H1", "I1"], 2)}
      ${blankCell("J1", 2)}
      ${inlineCell("K1", "Game Win Percentage", 4)}
    </row>
    <row r="2" ht="22.5" customHeight="1">
      ${["Player Name", "Date", "Placing", "Total Points", "Games Played", "Normal Wins", "Lock and Win", "Normal Losses", "Lock and Loss"].map((header, index) => inlineCell(`${columnName(index + 1)}2`, header, index === 4 ? 7 : 6)).join("")}
      ${inlineCell("J2", "Cup", 6)}
      ${blankCell("K2", 4)}
    </row>
    ${bodyRows}
    <row r="${totalsRow}" ht="15.75" customHeight="1">
      ${inlineCell(`A${totalsRow}`, "Games Played", 18)}
      ${blankStyledCells([`B${totalsRow}`, `C${totalsRow}`, `D${totalsRow}`, `E${totalsRow}`], 21)}
      ${formulaCell(`F${totalsRow}`, `SUM(F3:F${totalsRow - 1})`, sumRows(rows, "normalWins"), 21)}
      ${formulaCell(`G${totalsRow}`, `SUM(G3:G${totalsRow - 1})`, sumRows(rows, "lockWins"), 21)}
      ${blankStyledCells([`H${totalsRow}`, `I${totalsRow}`, `J${totalsRow}`, `K${totalsRow}`], 22)}
    </row>
    <row r="${noteRow}" ht="30.75" customHeight="1">
      ${inlineCell(`A${noteRow}`, `Note: Total games played per player is ${rows[0]?.gamesPlayed ?? 0}. A baseline max pts per player = ${(rows[0]?.gamesPlayed ?? 0) * BASELINE_WIN_POINTS} (${rows[0]?.gamesPlayed ?? 0} x ${BASELINE_WIN_POINTS}). Not taking into consideration bonus to be gained by a lock and win.`, 23)}
      ${blankStyledCells([`B${noteRow}`, `C${noteRow}`, `D${noteRow}`, `E${noteRow}`, `F${noteRow}`, `G${noteRow}`, `H${noteRow}`, `I${noteRow}`], 23)}
      ${blankStyledCells([`J${noteRow}`, `K${noteRow}`], 24)}
    </row>
  </sheetData>
  <mergeCells count="3">
    <mergeCell ref="A1:I1"/>
    <mergeCell ref="K1:K2"/>
    <mergeCell ref="A${noteRow}:I${noteRow}"/>
  </mergeCells>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`);
}

function dashboardDataRow(row, rowNumber) {
  return `\
    <row r="${rowNumber}" ht="15.75" customHeight="1">
      ${inlineCell(`A${rowNumber}`, row.playerName, rowNumber === 11 ? 25 : rowNumber === 3 ? 8 : 16)}
      ${numberCell(`B${rowNumber}`, row.dateSerial, 9)}
      ${numberCell(`C${rowNumber}`, row.placing, 10)}
      ${numberCell(`D${rowNumber}`, row.totalPoints, 11)}
      ${numberCell(`E${rowNumber}`, row.gamesPlayed, 12)}
      ${numberCell(`F${rowNumber}`, row.normalWins, 13)}
      ${numberCell(`G${rowNumber}`, row.lockWins, 11)}
      ${numberCell(`H${rowNumber}`, row.normalLosses, 14)}
      ${numberCell(`I${rowNumber}`, row.lockLoses, 11)}
      ${blankCell(`J${rowNumber}`, 11)}
      ${formulaCell(`K${rowNumber}`, `IF(E${rowNumber}=0,0,(F${rowNumber}+G${rowNumber})/E${rowNumber}*100/1)`, row.winPercentage, 15)}
    </row>`;
}

function contentTypesXml() {
  return xmlDeclaration(`\
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`);
}

function rootRelsXml() {
  return xmlDeclaration(`\
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);
}

function workbookXml() {
  return xmlDeclaration(`\
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Dashboard" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`);
}

function workbookRelsXml() {
  return xmlDeclaration(`\
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
}

function appPropsXml() {
  return xmlDeclaration(`\
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Dominoes Table</Application>
</Properties>`);
}

function corePropsXml(now) {
  return xmlDeclaration(`\
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>Dominoes Table</dc:creator>
  <cp:lastModifiedBy>Dominoes Table</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${escapeXml(now.toISOString())}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${escapeXml(now.toISOString())}</dcterms:modified>
</cp:coreProperties>`);
}

function stylesXml() {
  return xmlDeclaration(`\
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2">
    <numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/>
    <numFmt numFmtId="165" formatCode="0.0"/>
  </numFmts>
  <fonts count="6">
    <font><sz val="11"/><color rgb="FF000000"/><name val="Arial"/></font>
    <font><b/><sz val="14"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
    <font><b/><sz val="11"/><color rgb="FF0F3D35"/><name val="Arial"/></font>
    <font><sz val="11"/><color rgb="FF0F3D35"/><name val="Arial"/></font>
    <font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
  </fonts>
  <fills count="8">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF12463D"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF3E8C7"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE9DFC6"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF87CEEB"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="3">
    <border/>
    <border><left style="thin"><color rgb="FFD8CCAF"/></left><right style="thin"><color rgb="FFD8CCAF"/></right><top style="thin"><color rgb="FFD8CCAF"/></top><bottom style="thin"><color rgb="FFD8CCAF"/></bottom></border>
    <border><left/><right/><top style="thin"><color rgb="FFD8CCAF"/></top><bottom style="thin"><color rgb="FFD8CCAF"/></bottom></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="26">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="5" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="2" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="164" fontId="4" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="165" fontId="4" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`);
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [name, content] of entries) {
    const nameBuffer = Buffer.from(name, "utf8");
    const data = Buffer.from(content, "utf8");
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + data.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);

  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(centralDirectoryOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }

    table[index] = value >>> 0;
  }

  return table;
})();

function championshipDate(championship, now) {
  const value = championship.startTime ?? championship.endTime;
  const date = value ? new Date(value) : now;

  return Number.isNaN(date.getTime()) ? now : date;
}

function excelDateSerial(date) {
  return Math.floor(date.getTime() / MS_PER_DAY) + EXCEL_EPOCH_OFFSET;
}

function formatDateLabel(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function formatLongDate(date) {
  return `${date.getUTCFullYear()} ${date.toLocaleString("en-US", { month: "long", timeZone: "UTC" })} ${pad2(date.getUTCDate())}`;
}

function xmlDeclaration(xml) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${xml}`;
}

function inlineCell(ref, text, style = 0) {
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${escapeXml(text)}</t></is></c>`;
}

function numberCell(ref, value, style = 0) {
  return `<c r="${ref}" s="${style}"><v>${Number(value) || 0}</v></c>`;
}

function formulaCell(ref, formula, value, style = 0) {
  return `<c r="${ref}" s="${style}"><f>${escapeXml(formula)}</f><v>${Number(value) || 0}</v></c>`;
}

function blankCell(ref, style = 0) {
  return `<c r="${ref}" s="${style}"/>`;
}

function blankStyledCells(refs, style) {
  return refs.map((ref) => blankCell(ref, style)).join("");
}

function columnName(index) {
  let result = "";
  let value = index;

  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }

  return result;
}

function sumRows(rows, key) {
  return rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
