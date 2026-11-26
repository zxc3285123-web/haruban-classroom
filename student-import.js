let studentImport = null;
const importStudentView = studentView;
studentView = function () {
  const html = importStudentView();
  return html.replace(addBtn('학생 추가', 'students'), `<div class="heading-actions"><button class="btn" data-action="student-import">${icon('download')}엑셀로 학생 추가</button>${addBtn('학생 추가', 'students')}</div>`);
};

function importModal() {
  studentImport = { year: activeYear, records: [], workbook: null, request: 0 };
  $('#modal').classList.add('student-import-modal');
  $('#modal').innerHTML = `<div class="modal-head"><h2>엑셀로 학생 추가</h2><button class="text-btn" data-action="close" aria-label="닫기">${icon('close')}</button></div>
    <p class="import-year"><b>${activeYear}학년도 · ${esc(state.className)}</b>에 추가합니다.</p>
    <div class="import-instructions"><p>엑셀에 번호와 학생 이름을 적어 주세요. 지원 정보는 필요한 항목만 입력해요.</p><button class="btn" data-action="student-template">양식 내려받기 (.xlsx)</button></div>
    <label class="field">학생 목록 엑셀 파일<input id="student-xlsx" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>
    <p class="small muted">.xlsx 파일을 지원합니다. .xls 파일은 엑셀에서 .xlsx로 다시 저장해 주세요.</p>
    <div id="student-sheet-choice"></div><p id="student-import-status" role="status" aria-live="polite"></p><div id="student-import-preview"></div>
    <div class="modal-foot"><button class="btn" data-action="close">취소</button><button class="btn primary" id="student-import-save" disabled>학생 추가</button></div>`;
  $('#modal').showModal();
}

function previewStudents(records) {
  studentImport.records = records;
  const valid = records.filter(r => !r.issues.length);
  $('#student-import-status').textContent = `전체 ${records.length}명 중 추가 가능 ${valid.length}명, 확인 필요 ${records.length - valid.length}명`;
  $('#student-import-preview').innerHTML = `<p>체크한 학생만 추가됩니다. 확인이 필요한 행은 엑셀을 수정한 뒤 다시 불러와 주세요.</p><div class="table-wrap import-table"><table><thead><tr><th>선택</th><th>행</th><th>번호</th><th>학생 이름</th><th>지원 정보</th><th>확인</th></tr></thead><tbody>${records.map((r, i) => {
    const details = StudentSheet.columns.slice(2).filter(([key]) => r.data[key]);
    return `<tr><td><input type="checkbox" data-import-row="${i}" aria-label="${esc(r.data.name || r.row + '행')} 추가 선택" ${r.selected ? 'checked' : ''} ${r.issues.length ? 'disabled' : ''}></td><td>${r.row}</td><td>${esc(Number.isFinite(r.data.number) ? r.data.number : '')}</td><td>${esc(r.data.name || '이름 없음')}</td><td>${details.length ? `<details><summary>${details.length}개 항목</summary><dl>${details.map(([key, label]) => `<dt>${label}</dt><dd>${esc(r.data[key])}</dd>`).join('')}</dl></details>` : '없음'}</td><td class="${r.issues.length ? 'form-error' : ''}">${esc(r.issues.join(' · ') || '추가 가능')}</td></tr>`;
  }).join('')}</tbody></table></div>`;
  updateImportCount();
}

function updateImportCount() {
  const count = studentImport.records.filter(r => r.selected && !r.issues.length).length;
  const button = $('#student-import-save');
  button.textContent = `학생 ${count}명 추가`;
  button.disabled = !count;
}

async function selectStudentSheet(index) {
  const context = studentImport;
  const request = ++context.request;
  $('#student-import-save').disabled = true;
  $('#student-import-preview').innerHTML = '';
  $('#student-import-status').textContent = '학생 목록을 읽고 있어요.';
  try {
    const rows = await context.workbook.rows(index);
    if (context !== studentImport || request !== context.request || !$('#modal').open) return;
    previewStudents(StudentSheet.prepare(rows, state.students));
  } catch (error) {
    if (context !== studentImport || request !== context.request) return;
    context.records = [];
    $('#student-import-status').textContent = error.message;
    $('#student-import-save').disabled = true;
  }
}

async function loadStudentFile(file) {
  const context = studentImport;
  const request = ++context.request;
  context.records = [];
  $('#student-import-save').disabled = true;
  $('#student-import-preview').innerHTML = '';
  $('#student-sheet-choice').innerHTML = '';
  if (!/\.xlsx$/i.test(file.name) || file.size > 10 * 1024 * 1024) {
    $('#student-import-status').textContent = '10MB 이하의 .xlsx 파일을 선택해 주세요.';
    return;
  }
  $('#student-import-status').textContent = '엑셀 파일을 읽고 있어요.';
  try {
    const workbook = await StudentSheet.open(await file.arrayBuffer());
    if (context !== studentImport || request !== context.request || !$('#modal').open) return;
    context.workbook = workbook;
    $('#student-sheet-choice').innerHTML = `<label class="field">가져올 시트<select id="student-sheet-index">${workbook.sheets.map((s, i) => `<option value="${i}">${esc(s.name)}</option>`).join('')}</select></label>`;
    await selectStudentSheet(0);
  } catch (error) {
    if (context !== studentImport || request !== context.request) return;
    $('#student-import-status').textContent = error.message || '파일을 읽지 못했어요.';
  }
}

function saveImportedStudents() {
  const context = studentImport;
  if (!context || context.year !== activeYear) { toast('학년도가 바뀌었어요. 다시 불러와 주세요.'); return; }
  const selected = context.records.filter(r => r.selected && !r.issues.length);
  if (!selected.length) return;
  const currentNumbers = new Set(state.students.map(s => Number(s.number)));
  if (selected.some(r => currentNumbers.has(r.data.number))) {
    previewStudents(context.records.map(r => currentNumbers.has(r.data.number)
      ? { ...r, issues: ['현재 학년도에서 사용하는 번호예요'], selected: false } : r));
    return;
  }
  const previous = state.students;
  state.students = [...previous, ...selected.map(r => ({ id: uid(), ...r.data }))];
  if (!persist()) { state.students = previous; return; }
  $('#modal').close();
  activeStudent = state.students[previous.length].id;
  studentTab = 'support';
  filter = '';
  renderContent();
  toast(`학생 ${selected.length}명을 추가했어요.`);
}

document.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.action === 'student-import') importModal();
  if (button.id === 'student-import-save') saveImportedStudents();
  if (button.dataset.action === 'student-template') {
    button.disabled = true;
    try { download(await StudentSheet.template(), '하루반-학생추가-양식.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); }
    catch { toast('양식을 만들지 못했어요. 다시 눌러 주세요.'); }
    finally { button.disabled = false; }
  }
});
document.addEventListener('change', event => {
  if (event.target.id === 'student-xlsx' && event.target.files[0]) loadStudentFile(event.target.files[0]);
  if (event.target.id === 'student-sheet-index') selectStudentSheet(Number(event.target.value));
  if (event.target.dataset.importRow !== undefined) {
    studentImport.records[Number(event.target.dataset.importRow)].selected = event.target.checked;
    updateImportCount();
  }
});
$('#modal').addEventListener('close', () => {
  $('#modal').classList.remove('student-import-modal');
  studentImport = null;
});
