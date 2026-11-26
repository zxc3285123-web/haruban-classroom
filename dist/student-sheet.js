/* Parse XLSX locally and prepare additive student records. */
const StudentSheet = (() => {
  const columns = [
    ['number', '번호', ['출석번호', '학번']],
    ['name', '학생 이름', ['이름', '성명', '학생명']],
    ['support', '도움이 되는 지원 방법', ['도움이 되는 지원', '지원 방법']],
    ['memo', '학생 메모', ['메모']],
    ['communication', '의사소통 방법', []],
    ['understanding', '안내를 이해하는 방법', []],
    ['strengths', '강점 · 관심 · 선호', ['강점', '강점과 선호']],
    ['environment', '편안한 환경', []],
    ['dailyLiving', '일상생활 지원', []],
    ['regulation', '안정에 도움이 되는 지원', []],
    ['learningGoal', '현재 교육 목표', []],
    ['handover', '등하교 · 인계 메모', ['인계 메모']],
    ['profileChecked', '지원 정보 확인일', []]
  ];
  const normalize = value => String(value ?? '').replace(/[\s·.()_-]/g, '').toLocaleLowerCase();
  const xml = value => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  const elements = (root, tag) => [...root.getElementsByTagNameNS('*', tag)];
  const richText = root => elements(root, 't').map(el => el.textContent).join('');

  function parseXml(text) {
    if (/<!DOCTYPE/i.test(text)) throw new Error('이 형식의 엑셀 파일은 지원하지 않아요. 새 .xlsx 파일로 저장해 주세요.');
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (elements(doc, 'parsererror').length) throw new Error('엑셀 파일을 읽을 수 없어요. 다시 저장해 주세요.');
    return doc;
  }

  // Check declared uncompressed sizes before reading XML into memory.
  function checkZipSize(buffer) {
    const view = new DataView(buffer);
    let end = -1;
    for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
    }
    if (end < 0) throw new Error('.xlsx 형식의 엑셀 파일을 선택해 주세요.');
    const count = view.getUint16(end + 10, true);
    let offset = view.getUint32(end + 16, true);
    let total = 0;
    for (let i = 0; i < count; i++) {
      if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== 0x02014b50) {
        throw new Error('엑셀 파일의 압축 정보를 읽을 수 없어요.');
      }
      total += view.getUint32(offset + 24, true);
      if (total > 80 * 1024 * 1024) throw new Error('파일 내용이 너무 큽니다. 학생 목록만 새 파일에 저장해 주세요.');
      offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    }
  }

  function resolvePath(base, target) {
    if (!target || target.includes('\\') || target.includes(':')) throw new Error('시트 경로를 읽을 수 없어요.');
    const path = target.startsWith('/') ? target.slice(1) : base + '/' + target;
    const parts = [];
    for (const part of path.split('/')) {
      if (part === '..') parts.pop();
      else if (part && part !== '.') parts.push(part);
    }
    return parts.join('/');
  }

  async function open(buffer) {
    checkZipSize(buffer);
    let zip;
    try { zip = await JSZip.loadAsync(buffer); }
    catch { throw new Error('암호가 없고 손상되지 않은 .xlsx 파일을 선택해 주세요.'); }
    async function read(path, required = true) {
      const file = zip.file(path);
      if (!file) {
        if (!required) return null;
        throw new Error('엑셀 시트를 읽을 수 없어요. 파일을 .xlsx로 다시 저장해 주세요.');
      }
      return parseXml(await file.async('string'));
    }
    const workbook = await read('xl/workbook.xml');
    const relationships = elements(await read('xl/_rels/workbook.xml.rels'), 'Relationship');
    const sharedDoc = await read('xl/sharedStrings.xml', false);
    const shared = sharedDoc ? elements(sharedDoc, 'si').map(richText) : [];
    const sheets = elements(workbook, 'sheet').flatMap(sheet => {
      const id = sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      const rel = relationships.find(r => r.getAttribute('Id') === id);
      if (!rel || rel.getAttribute('TargetMode') === 'External' || !rel.getAttribute('Type').endsWith('/worksheet')) return [];
      return [{ name: sheet.getAttribute('name'), path: resolvePath('xl', rel.getAttribute('Target')) }];
    });
    if (!sheets.length) throw new Error('읽을 수 있는 시트가 없어요.');
    async function rows(index) {
      const doc = await read(sheets[index].path);
      const rows = elements(doc, 'row');
      if (rows.length > 10000) throw new Error('학생 목록이 너무 깁니다. 10,000행 이하로 나눠 주세요.');
      return rows.map((row, rowIndex) => {
        const cells = [];
        const formulas = [];
        for (const cell of elements(row, 'c')) {
          const ref = /^([A-Z]+)\d+$/.exec(cell.getAttribute('r') || '');
          let col = cells.length;
          if (ref) col = [...ref[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
          if (col >= 256) continue;
          const type = cell.getAttribute('t');
          const raw = elements(cell, 'v')[0]?.textContent ?? '';
          cells[col] = type === 's' ? shared[Number(raw)] ?? '' : type === 'inlineStr' ? richText(cell) : raw;
          if (elements(cell, 'f').length) formulas.push(col);
          if (type === 'e') formulas.push(col);
        }
        return { row: Number(row.getAttribute('r')) || rowIndex + 1, cells, formulas };
      });
    }
    return { sheets, rows };
  }

  function prepare(rows, existing) {
    let headerIndex = -1;
    let mapping;
    for (let i = 0; i < Math.min(20, rows.length); i++) {
      const header = rows[i].cells.map(normalize);
      const candidate = columns.map(([, label, aliases]) => header.findIndex(h => [label, ...aliases].some(a => normalize(a) === h)));
      if (candidate[0] >= 0 && candidate[1] >= 0) { headerIndex = i; mapping = candidate; break; }
    }
    if (headerIndex < 0) throw new Error('열 제목에서 번호와 학생 이름을 찾지 못했어요. 양식을 내려받아 작성해 주세요.');
    const numbers = new Set(existing.map(s => Number(s.number)));
    const fileNumbers = new Set();
    const records = [];
    for (const row of rows.slice(headerIndex + 1)) {
      const data = {};
      columns.forEach(([key], i) => { data[key] = String(row.cells[mapping[i]] ?? '').trim(); });
      if (!Object.values(data).some(Boolean)) continue;
      const issues = [];
      if (row.formulas.some(col => mapping.includes(col))) issues.push('수식을 값으로 바꿔 주세요');
      const number = Number(data.number);
      if (!data.name) issues.push('이름이 비어 있어요');
      if (!data.number || !Number.isSafeInteger(number) || number < 1 || number > 10000000000) issues.push('번호를 확인해 주세요');
      if (data.name.length > 200) issues.push('이름은 200자 이하로 적어 주세요');
      if (Object.entries(data).some(([key, value]) => key !== 'name' && value.length > 6000)) issues.push('지원 정보는 항목당 6,000자 이하로 적어 주세요');
      if (numbers.has(number)) issues.push('현재 학년도에서 사용하는 번호예요');
      if (fileNumbers.has(number)) issues.push('엑셀 안에서 번호가 겹쳐요');
      fileNumbers.add(number);
      if (data.profileChecked) {
        if (/^\d+(\.\d+)?$/.test(data.profileChecked)) {
          const date = new Date((Number(data.profileChecked) - 25569) * 86400000);
          data.profileChecked = Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
          if (!data.profileChecked) issues.push('확인일을 확인해 주세요');
        } else if (!/^\d{4}-\d{2}-\d{2}$/.test(data.profileChecked) || !Number.isFinite(Date.parse(data.profileChecked)) || new Date(data.profileChecked).toISOString().slice(0, 10) !== data.profileChecked) {
          issues.push('확인일은 YYYY-MM-DD로 적어 주세요');
        }
      }
      records.push({ row: row.row, data: { ...data, number }, issues, selected: !issues.length });
    }
    if (!records.length) throw new Error('추가할 학생이 없어요. 제목 아래에 학생을 입력해 주세요.');
    return records;
  }

  async function template() {
    const zip = new JSZip();
    const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const cell = (ref, value, style = 0) => `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    const headers = columns.map(([, label], i) => cell(String.fromCharCode(65 + i) + '1', label, 1)).join('');
    const instructions = [
      ['학생 엑셀 추가 양식'],
      ['학생 목록 시트의 첫 행은 열 제목입니다. 둘째 행부터 한 줄에 한 학생을 입력하세요.'],
      ['번호와 학생 이름을 입력하세요. 나머지 지원 정보는 선택 입력입니다.'],
      ['번호는 현재 학년도에서 겹치지 않는 1 이상의 정수로 입력하세요.'],
      ['같은 번호가 이미 있으면 미리보기에서 확인할 수 있습니다.'],
      ['지원 정보 확인일은 2026-11-24처럼 YYYY-MM-DD로 입력하세요.'],
      ['수식은 값으로 바꾸고, .xlsx 형식으로 저장하세요.'],
      ['추가할 학년도를 하루반에서 먼저 선택한 뒤 파일을 불러오세요.']
    ];
    const sheet1 = `<worksheet xmlns="${ns}"><dimension ref="A1:M1"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="10" customWidth="1"/><col min="2" max="2" width="18" customWidth="1"/><col min="3" max="13" width="30" customWidth="1"/></cols><sheetData><row r="1" ht="34" customHeight="1">${headers}</row></sheetData></worksheet>`;
    const sheet2 = `<worksheet xmlns="${ns}"><cols><col min="1" max="1" width="100" customWidth="1"/></cols><sheetData>${instructions.map(([text], i) => `<row r="${i + 1}" ht="34" customHeight="1">${cell('A' + (i + 1), text)}</row>`).join('')}</sheetData></worksheet>`;
    const files = {
      '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
      '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml': `<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="학생 목록" sheetId="1" r:id="rId1"/><sheet name="입력 안내" sheetId="2" r:id="rId2"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      'xl/styles.xml': `<styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><name val="맑은 고딕"/><color rgb="FFFFFFFF"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF315D4E"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf xfId="0" fontId="0"/><xf xfId="0" fontId="1" fillId="2" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
      'xl/worksheets/sheet1.xml': sheet1,
      'xl/worksheets/sheet2.xml': sheet2
    };
    Object.entries(files).forEach(([path, content]) => zip.file(path, declaration + content));
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  }

  return { open, prepare, template, columns };
})();
