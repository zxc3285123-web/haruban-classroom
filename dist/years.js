/* Switch between school years without moving records between classes. */
const renderBeforeYears = renderContent;
renderContent = function () {
  if (page === 'years') {
    $('#content').innerHTML = yearsView();
    return;
  }
  renderBeforeYears();
};

function latestYears() {
  return SchoolYears.read(localStorage) || archive;
}

function yearsView() {
  let records;
  try { records = latestYears(); } catch {}
  const rows = Object.entries(records?.years || {}).sort(([a], [b]) => Number(b) - Number(a));
  return heading('학년도 관리', '학년도별로 학급과 기록을 보관하고 필요할 때 다시 열 수 있어요.') +
    `<section class="card setting-group">
      <h2>보관된 학년도</h2>
      <p class="sub">현재 사용 중인 학년도는 ${activeYear}학년도입니다.</p>
      <div class="year-list">${rows.map(([year, data]) => `<article class="year-entry">
        <div><h3>${year}학년도 ${Number(year) === activeYear ? '<span class="badge">사용 중</span>' : ''}</h3>
        <p class="sub">${esc(data.className)} · 학생 ${data.students.length}명 · 학생 기록 ${data.notes.length}건</p></div>
        ${Number(year) === activeYear
          ? '<button class="btn" data-page="home">기록 보기</button>'
          : `<button class="btn" data-open-school-year="${year}" aria-label="${year}학년도 열기">열기</button>`}
      </article>`).join('')}</div>
      <button class="btn primary" data-action="new-year">${icon('plus')}새 학년도 만들기</button>
    </section>
    <section class="card setting-group">
      <h2>학년도 백업</h2>
      <p>이 브라우저에 저장된 학년도를 파일로 보관하거나 다른 기기에서 불러올 수 있어요.</p>
      <div class="toolbar">
        <button class="btn" data-action="export-years">모든 학년도 백업</button>
        <button class="btn" data-action="export">현재 학년도 백업</button>
        <button class="btn" data-action="import">백업 불러오기</button>
        <input id="import-file" type="file" accept="application/json,.json" hidden>
      </div>
    </section>`;
}

function openSchoolYear(year, incoming = {}) {
  if (!persist()) return false;
  try {
    const latest = latestYears();
    const next = { ...latest, activeYear: year, years: { ...latest.years, ...incoming } };
    if (!SchoolYears.isArchive(next)) return false;
    next.years[year] = structuredClone(next.years[year]);
    Planner.normalize(next.years[year]);
    archive = SchoolYears.write(localStorage, next);
    activeYear = year;
    state = structuredClone(next.years[year]);
    savedYear = JSON.stringify(state);
    selectedDate = today();
    selectedCheck = '';
    activeStudent = null;
    studentTab = 'notes';
    noteDomain = noteFrom = noteUntil = '';
    taskCategory = '';
    taskStatus = 'open';
    go('home');
    return true;
  } catch {
    toast('학년도를 저장하지 못했어요. 브라우저의 저장 공간을 확인해 주세요.');
    return false;
  }
}

function newSchoolYear() {
  const suggested = Math.min(2200, Math.max(activeYear, ...Object.keys(latestYears().years).map(Number)) + 1);
  $('#modal').innerHTML = `<form id="year-form">
    <div class="modal-head"><h2>새 학년도 만들기</h2><button type="button" class="text-btn" data-action="close" aria-label="닫기">${icon('close')}</button></div>
    <p class="sub">새 학급에 학생과 기록을 입력할 수 있어요.</p>
    <label class="field">학년도<input name="year" type="number" min="1900" max="2200" value="${suggested}" required></label>
    <label class="field">학급 이름<input name="className" maxlength="40" placeholder="예: 2학년 1반" required></label>
    <label class="field">담임 이름 또는 호칭<input name="teacher" maxlength="30" value="${esc(state.teacher)}" required></label>
    <p class="form-error" id="year-error" role="alert"></p>
    <div class="modal-foot"><button type="button" class="btn" data-action="close">취소</button><button class="btn primary">학년도 만들기</button></div>
  </form>`;
  $('#modal').showModal();
}

async function importSchoolYears(input) {
  const file = input.files[0];
  input.value = '';
  if (file.size > 20 * 1024 * 1024) { toast('20MB 이하의 백업 파일을 선택해 주세요.'); return; }
  let incoming, year;
  try {
    const data = JSON.parse(await file.text());
    if (SchoolYears.isArchive(data) && Object.values(data.years).every(validateBackup)) {
      incoming = data.years;
      year = data.activeYear;
    } else if (validateBackup(data)) {
      year = data.schoolYear || activeYear;
      incoming = { [year]: { ...data, schoolYear: year } };
    } else throw new Error('invalid backup');
    const existing = latestYears().years;
    const matching = Object.keys(incoming).filter(y => Object.hasOwn(existing, y));
    const snapshot = JSON.stringify(existing);
    const message = matching.length
      ? `${matching.join(', ')}학년도 기록을 백업에 있는 내용으로 바꿉니다. 불러올까요?`
      : `${Object.keys(incoming).length}개 학년도 기록을 추가할까요?`;
    confirmBox('학년도 백업 불러오기', message, () => {
      if (JSON.stringify(latestYears().years) !== snapshot) {
        toast('기록이 변경됐어요. 백업 파일을 다시 선택해 주세요.');
        return;
      }
      if (openSchoolYear(year, incoming)) toast('학년도 기록을 불러왔어요.');
    });
  } catch { toast('올바른 하루반 백업 파일을 선택해 주세요.'); }
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.openSchoolYear) openSchoolYear(Number(button.dataset.openSchoolYear));
  if (button.dataset.action === 'new-year') {
    try { newSchoolYear(); } catch { toast('학년도 기록을 읽을 수 없어요.'); }
  }
  if (button.dataset.action === 'export-years' && persist()) {
    try {
      const data = { ...latestYears(), activeYear };
      download(JSON.stringify(data, null, 2), `하루반-모든학년도-${today()}.json`, 'application/json');
      toast('모든 학년도의 백업 파일을 내려받았어요.');
    } catch { toast('학년도 기록을 읽을 수 없어요.'); }
  }
});

document.addEventListener('submit', event => {
  if (event.target.id !== 'year-form') return;
  event.preventDefault();
  const data = new FormData(event.target);
  const year = Number(data.get('year'));
  const className = data.get('className').trim();
  const teacher = data.get('teacher').trim();
  const error = $('#year-error');
  if (!SchoolYears.validYear(year) || !className || !teacher) {
    error.textContent = '학년도, 학급 이름, 담임 이름을 입력해 주세요.';
    return;
  }
  try {
    if (Object.hasOwn(latestYears().years, year)) {
      error.textContent = '이미 만든 학년도예요. 목록에서 열어 주세요.';
      return;
    }
    const records = { ...blank(), schoolYear: year, className, teacher, schoolName: state.schoolName || '' };
    Planner.normalize(records);
    if (openSchoolYear(year, { [year]: records })) {
      $('#modal').close();
      toast(`${year}학년도를 만들었어요.`);
    }
  } catch { error.textContent = '학년도를 저장하지 못했어요.'; }
});
