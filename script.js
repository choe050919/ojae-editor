// Firebase 설정
const firebaseConfig = {
    apiKey: "AIzaSyBg1Jv4ptASD_ANUz2vsZfsJuqEWQqvaPE",
    authDomain: "ojae-editor.firebaseapp.com",
    databaseURL: "https://ojae-editor-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "ojae-editor",
    storageBucket: "ojae-editor.firebasestorage.app",
    messagingSenderId: "296135833858",
    appId: "1:296135833858:web:b7b409247d5a81e977aa1b"
};

// Firebase 초기화
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// DOM 요소
const novelTitleInput = document.getElementById('novel-title');
const sectionTitleInput = document.getElementById('section-title');
const editor = document.getElementById('novel-editor');
const countDisplay = document.getElementById('char-count');
const toast = document.getElementById('toast');
const syncStatus = document.getElementById('sync-status');
const myLinkInput = document.getElementById('my-link');
const sectionListEl = document.getElementById('section-list');
const typeToggleBtn = document.getElementById('type-toggle-btn');
const editorArea = document.querySelector('.editor-area');

// 문서 ID
let docId = window.location.hash.slice(1);
if (!docId) {
    docId = generateId();
    window.location.hash = docId;
}
myLinkInput.value = window.location.href;

// 섹션 데이터
let sections = [];
let novelTitle = '';
let currentSectionIndex = 0;
let isLoadingFromServer = false;

// ID 생성 함수
function generateId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 12; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Firebase 참조
const docRef = db.ref('novels/' + docId);

// 방문 기록 업데이트
function updateLastVisited() {
    docRef.update({
        lastVisited: Date.now()
    }).catch((error) => {
        console.error('방문 기록 오류:', error);
    });
}

// 데이터 불러오기
docRef.on('value', (snapshot) => {
    const data = snapshot.val();
    isLoadingFromServer = true;
    
    if (data && data.sections) {
        // 새 형식 (섹션 있음)
        sections = data.sections;
        novelTitle = data.title || '';
        // 방문 기록 업데이트
        updateLastVisited();
    } else if (data && data.content !== undefined) {
        // 기존 형식 -> 마이그레이션
        novelTitle = data.title || '';
        sections = [{
            id: generateId(),
            title: '',
            content: data.content,
            type: 'body'
        }];
        // 서버에 새 형식으로 저장
        saveToFirebase();
    } else {
        // 새 문서
        novelTitle = '';
        sections = [{
            id: generateId(),
            title: '',
            content: '',
            type: 'body'
        }];
        // 새 문서도 방문 기록
        updateLastVisited();
    }
    
    novelTitleInput.value = novelTitle;
    renderSectionList();
    loadSection(currentSectionIndex);
    
    syncStatus.textContent = '동기화됨 ✓';
    syncStatus.classList.add('synced');
    isLoadingFromServer = false;
});

// 연결 상태 모니터링
db.ref('.info/connected').on('value', (snapshot) => {
    if (snapshot.val() === true) {
        syncStatus.textContent = '동기화됨 ✓';
        syncStatus.classList.add('synced');
    } else {
        syncStatus.textContent = '오프라인';
        syncStatus.classList.remove('synced');
    }
});

// 섹션 목록 렌더링
function renderSectionList() {
    sectionListEl.innerHTML = '';
    
    sections.forEach((section, index) => {
        const item = document.createElement('div');
        const isNote = section.type === 'note';
        item.className = 'section-item' + (index === currentSectionIndex ? ' active' : '') + (isNote ? ' note-type' : '');
        item.draggable = true;
        item.dataset.index = index;
        
        const dragHandle = document.createElement('span');
        dragHandle.className = 'drag-handle';
        dragHandle.textContent = '⋮⋮';
        
        const label = document.createElement('span');
        label.className = 'section-label';
        const typeIcon = isNote ? '📝 ' : '';
        const displayTitle = section.title ? `${index + 1}. ${typeIcon}${section.title}` : `${index + 1}. ${typeIcon}(무제)`;
        label.textContent = displayTitle;
        label.onclick = () => switchSection(index);
        
        item.appendChild(dragHandle);
        item.appendChild(label);
        
        // 삭제 버튼 (섹션이 2개 이상일 때만)
        if (sections.length > 1) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'section-delete-btn';
            deleteBtn.textContent = '×';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                deleteSection(index);
            };
            item.appendChild(deleteBtn);
        }
        
        sectionListEl.appendChild(item);
    });
    
    // 드래그 앤 드롭 초기화
    initSectionDragAndDrop();
}

// ===== 섹션 드래그 앤 드롭 =====
let draggedSectionItem = null;

function initSectionDragAndDrop() {
    const items = sectionListEl.querySelectorAll('.section-item');
    
    items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            draggedSectionItem = item;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            draggedSectionItem = null;
            // 새 순서 저장
            updateSectionOrder();
        });
        
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!draggedSectionItem || draggedSectionItem === item) return;
            
            const rect = item.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            
            if (e.clientY < midY) {
                sectionListEl.insertBefore(draggedSectionItem, item);
            } else {
                sectionListEl.insertBefore(draggedSectionItem, item.nextSibling);
            }
        });
    });
}

function updateSectionOrder() {
    saveCurrentSection();
    
    const items = sectionListEl.querySelectorAll('.section-item');
    const oldCurrentId = sections[currentSectionIndex].id;
    const newSections = [];
    
    items.forEach((item, newIndex) => {
        const oldIndex = parseInt(item.dataset.index);
        newSections.push(sections[oldIndex]);
        item.dataset.index = newIndex;
        
        // 현재 섹션 추적
        if (sections[oldIndex].id === oldCurrentId) {
            currentSectionIndex = newIndex;
        }
    });
    
    sections.length = 0;
    newSections.forEach(s => sections.push(s));
    
    renderSectionList();
    saveToFirebase();
    showToast('섹션 순서가 변경되었습니다');
}

// 섹션 전환
function switchSection(index) {
    // 현재 섹션 저장
    saveCurrentSection();
    
    // 새 섹션 로드
    currentSectionIndex = index;
    loadSection(index);
    renderSectionList();
}

// 섹션 로드
function loadSection(index) {
    const section = sections[index];
    if (section) {
        sectionTitleInput.value = section.title || '';
        editor.value = section.content || '';
        updateCharCount();
        updateTypeUI(section.type || 'body');
    }
}

// 타입 UI 업데이트
function updateTypeUI(type) {
    const isNote = type === 'note';
    typeToggleBtn.textContent = isNote ? '📝 노트' : '📄 본문';
    typeToggleBtn.classList.toggle('note', isNote);
    editorArea.classList.toggle('note-mode', isNote);
}

// 섹션 타입 토글
function toggleSectionType() {
    const section = sections[currentSectionIndex];
    if (section) {
        section.type = section.type === 'note' ? 'body' : 'note';
        updateTypeUI(section.type);
        renderSectionList();
        saveToFirebase();
    }
}

// 현재 섹션 저장 (메모리에)
function saveCurrentSection() {
    if (sections[currentSectionIndex]) {
        sections[currentSectionIndex].title = sectionTitleInput.value;
        sections[currentSectionIndex].content = editor.value;
    }
}

// 섹션 추가
function addSection() {
    saveCurrentSection();
    
    const newSection = {
        id: generateId(),
        title: '',
        content: '',
        type: 'body'
    };
    
    sections.push(newSection);
    currentSectionIndex = sections.length - 1;
    
    renderSectionList();
    loadSection(currentSectionIndex);
    saveToFirebase();
    
    sectionTitleInput.focus();
}

// 섹션 삭제
function deleteSection(index) {
    if (sections.length <= 1) return;
    
    const section = sections[index];
    const displayName = section.title ? `"${section.title}"` : `섹션 ${index + 1}`;
    
    if (!confirm(`${displayName}을(를) 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
        return;
    }
    
    sections.splice(index, 1);
    
    // 현재 인덱스 조정
    if (currentSectionIndex >= sections.length) {
        currentSectionIndex = sections.length - 1;
    } else if (currentSectionIndex > index) {
        currentSectionIndex--;
    }
    
    renderSectionList();
    loadSection(currentSectionIndex);
    saveToFirebase();
}

// 저장 타이머
let saveTimer = null;

function handleInput() {
    updateCharCount();
    saveCurrentSection();
    
    syncStatus.textContent = '저장 중...';
    syncStatus.classList.remove('synced');
    
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveToFirebase, 500);
}

function saveToFirebase() {
    saveCurrentSection();
    novelTitle = novelTitleInput.value;
    
    docRef.set({
        title: novelTitle,
        sections: sections,
        updatedAt: Date.now()
    }).then(() => {
        syncStatus.textContent = '동기화됨 ✓';
        syncStatus.classList.add('synced');
    }).catch((error) => {
        syncStatus.textContent = '저장 실패';
        console.error('저장 오류:', error);
    });
}

// 이벤트 리스너
editor.addEventListener('input', handleInput);
novelTitleInput.addEventListener('input', handleInput);
sectionTitleInput.addEventListener('input', () => {
    handleInput();
    renderSectionList(); // 제목 변경 시 목록 업데이트
});

function updateCharCount() {
    const count = calculateCharCount();
    countDisplay.innerText = count.toLocaleString();
}

// 글자 수 계산 설정
let countScope = 'section'; // 'section' | 'all'
let countSpace = 'include'; // 'include' | 'exclude'

const scopeToggle = document.getElementById('scope-toggle');
const spaceToggle = document.getElementById('space-toggle');

function toggleScope() {
    countScope = (countScope === 'section') ? 'all' : 'section';
    scopeToggle.textContent = (countScope === 'section') ? '현재 섹션' : '전체';
    updateCharCount();
}

function toggleSpace() {
    countSpace = (countSpace === 'include') ? 'exclude' : 'include';
    spaceToggle.textContent = (countSpace === 'include') ? '공백 포함' : '공백 제외';
    updateCharCount();
}

function calculateCharCount() {
    let text = '';
    
    if (countScope === 'section') {
        text = editor.value;
    } else {
        // 전체: 현재 섹션 저장 후 모든 섹션 합산
        saveCurrentSection();
        text = sections.map(s => s.content || '').join('');
    }
    
    if (countSpace === 'exclude') {
        text = text.replace(/\s/g, '');
    }
    
    return text.length;
}

function showToast(message) {
    toast.innerText = message;
    toast.className = "show";
    setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 2000);
}

// 링크 토글
function toggleLinkBox() {
    const linkBox = document.getElementById('link-box');
    linkBox.classList.toggle('hidden');
}

// 링크 직접 복사
function copyLinkDirect() {
    myLinkInput.select();
    document.execCommand('copy');
    showToast('링크가 복사되었습니다');
}

// 파일 관리 토글
// Import 모달
function openImportModal() {
    document.getElementById('import-modal').classList.remove('hidden');
}

function closeImportModal() {
    document.getElementById('import-modal').classList.add('hidden');
}

// Export 모달
function openExportModal() {
    // 포맷 설명 초기화
    updateFormatDescription();
    // 범위 설명 초기화
    updateScopeDescription();
    
    document.getElementById('export-modal').classList.remove('hidden');
}

function closeExportModal() {
    document.getElementById('export-modal').classList.add('hidden');
}

// 포맷 설명 업데이트
function updateFormatDescription() {
    const format = document.getElementById('export-format').value;
    const descEl = document.getElementById('format-desc');
    
    if (format === 'editable') {
        descEl.textContent = '불러오기 가능';
    } else if (format === 'readable') {
        descEl.textContent = '불러오기 불가, 노트 제외';
    }
}

// 범위 설명 업데이트
function updateScopeDescription() {
    const scope = document.getElementById('export-scope').value;
    const descEl = document.getElementById('scope-desc');
    
    if (scope === 'all') {
        descEl.textContent = '';
    } else if (scope === 'current') {
        const section = sections[currentSectionIndex];
        const typeIcon = section.type === 'note' ? '📝 ' : '';
        const title = section.title || '(무제)';
        descEl.textContent = `${currentSectionIndex + 1}. ${typeIcon}${title}`;
    }
}

// Export 실행
function executeExport() {
    const format = document.getElementById('export-format').value;
    const scope = document.getElementById('export-scope').value;
    
    saveCurrentSection();
    
    let content = '';
    let fileName = '';
    
    const date = new Date();
    const dateStr = `${date.getFullYear()}${(date.getMonth()+1).toString().padStart(2,'0')}${date.getDate().toString().padStart(2,'0')}`;
    
    if (scope === 'all') {
        // 전체 내보내기
        if (format === 'editable') {
            // 편집용: 메타데이터 포함
            const meta = {
                version: 2,
                title: novelTitle,
                sections: sections.map(s => ({
                    id: s.id,
                    title: s.title,
                    type: s.type || 'body'
                }))
            };
            content = `<!--- NOVEL_META: ${JSON.stringify(meta)} --->\n\n`;
            sections.forEach((section, index) => {
                const typeTag = section.type === 'note' ? ' [NOTE]' : '';
                if (section.title) {
                    content += `<!--- SECTION: ${section.title}${typeTag} --->\n`;
                } else {
                    content += `<!--- SECTION: 섹션${index + 1}${typeTag} --->\n`;
                }
                content += section.content + '\n\n';
            });
        } else {
            // 읽기용: 메타데이터 없음, 본문만
            sections.forEach((section) => {
                if (section.type !== 'note') {
                    if (section.title) {
                        content += `# ${section.title}\n\n`;
                    }
                    content += section.content + '\n\n';
                }
            });
        }
        
        const safeTitle = (novelTitle || '소설').replace(/[\/\\?%*:|"<>]/g, '-');
        fileName = `${safeTitle}-${dateStr}.txt`;
    } else {
        // 현재 섹션 내보내기
        const section = sections[currentSectionIndex];
        
        if (format === 'editable') {
            content = `<!--- NOVEL_SECTION --->\n${section.content}`;
        } else {
            if (section.title) {
                content = `# ${section.title}\n\n`;
            }
            content += section.content;
        }
        
        const sectionTitle = section.title || `섹션${currentSectionIndex + 1}`;
        const safeTitle = sectionTitle.replace(/[\/\\?%*:|"<>]/g, '-');
        fileName = `${safeTitle}-${dateStr}.txt`;
    }
    
    // 파일 다운로드
    const blob = new Blob([content.trim()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    
    URL.revokeObjectURL(url);
    closeExportModal();
    showToast(`저장됨: ${fileName}`);
}

// 텍스트 파일로 내보내기 (모든 섹션 합침)
function exportTxt() {
    saveCurrentSection();
    
    if (sections.length === 0 || (sections.length === 1 && !sections[0].content)) {
        showToast('내보낼 내용이 없습니다');
        return;
    }
    
    // 새 형식: 메타데이터 + 앵커
    let fullText = '<!--- NOVEL_FULL --->\n\n';
    
    sections.forEach((section, index) => {
        if (index > 0) {
            fullText += '\n\n';
        }
        
        // 섹션 앵커
        const title = section.title || '';
        fullText += `<!--- SEC: ${title} --->\n`;
        
        // 본문
        fullText += section.content || '';
    });
    
    // 파일명 생성 (전체 제목 또는 무제)
    const mainTitle = novelTitleInput.value.trim() || '무제';
    const safeTitle = mainTitle.replace(/[\/\\?%*:|"<>]/g, '-');
    const date = new Date();
    const dateStr = `${date.getFullYear()}${(date.getMonth()+1).toString().padStart(2,'0')}${date.getDate().toString().padStart(2,'0')}`;
    const fileName = `${safeTitle}-${dateStr}.txt`;

    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    
    URL.revokeObjectURL(url);
    showToast(`저장됨: ${fileName}`);
}

// 마크다운 보기 토글
const markdownPreview = document.getElementById('markdown-preview');
const previewContent = document.getElementById('preview-content');
const toggleViewBtn = document.getElementById('toggle-view-btn');
let isPreviewMode = false;

function toggleView() {
    isPreviewMode = !isPreviewMode;
    
    if (isPreviewMode) {
        previewContent.innerHTML = marked.parse(editor.value);
        editor.classList.add('hidden');
        markdownPreview.classList.remove('hidden');
        toggleViewBtn.textContent = '편집 모드';
    } else {
        editor.classList.remove('hidden');
        markdownPreview.classList.add('hidden');
        toggleViewBtn.textContent = '마크다운 보기';
    }
}

// Ctrl+S
window.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        showToast('자동 저장됩니다');
    }
});

// ===== Import 기능 =====
const fileInput = document.getElementById('file-input');

function triggerImport() {
    fileInput.click();
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) processFile(file);
    event.target.value = '';
}

function processFile(file) {
    if (!file.name.toLowerCase().endsWith('.txt')) {
        alert("txt 파일만 불러올 수 있습니다.");
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        
        // 섹션 파일 체크 (전체 파일 버튼으로는 불가)
        if (text.startsWith('<!--- NOVEL_SECTION --->')) {
            alert("이 파일은 섹션 파일입니다.\n'섹션 파일 불러오기' 버튼을 사용하거나 드래그 앤 드롭으로 불러와주세요.");
            return;
        }
        
        const userConfirmed = confirm("현재 작성 중인 모든 섹션이 파일 내용으로 대체됩니다.\n계속하시겠습니까?");
        if (!userConfirmed) return;
        
        let parsed;
        
        if (text.startsWith('<!--- NOVEL_FULL --->')) {
            // 새 형식: 앵커 파싱
            parsed = parseNewFormatToSections(text);
        } else {
            // 레거시: 기존 로직
            parsed = parseTxtToSections(text);
        }
        
        sections = parsed;
        currentSectionIndex = 0;
        
        renderSectionList();
        loadSection(0);
        saveToFirebase();
        
        showToast(`${sections.length}개 섹션을 불러왔습니다`);
    };
    reader.readAsText(file);
}

function parseTxtToSections(text) {
    // 패턴: 줄 시작에서 "숫자." 또는 "숫자. 제목"
    const sectionPattern = /^(\d+)\.\s*(.*)$/gm;
    const matches = [...text.matchAll(sectionPattern)];
    
    if (matches.length === 0) {
        // 형식 안 맞음 → 전체를 하나의 섹션으로
        return [{
            id: generateId(),
            title: '',
            content: text.trim()
        }];
    }
    
    const result = [];
    
    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const title = match[2].trim(); // 제목 (없으면 빈 문자열)
        const startIndex = match.index + match[0].length;
        const endIndex = (i + 1 < matches.length) ? matches[i + 1].index : text.length;
        
        // 본문 추출 (앞뒤 공백/줄바꿈 정리)
        let content = text.slice(startIndex, endIndex).trim();
        
        result.push({
            id: generateId(),
            title: title,
            content: content
        });
    }
    
    return result;
}

function parseNewFormatToSections(text) {
    // <!--- SEC: 제목 ---> 형식 파싱
    const lines = text.split('\n');
    const result = [];
    let currentTitle = null;
    let currentContent = [];
    let inSection = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // 메타데이터 건너뛰기
        if (line.trim() === '<!--- NOVEL_FULL --->' || line.trim() === '') {
            if (!inSection) continue;
        }
        
        // 섹션 앵커 감지
        const anchorMatch = line.match(/^<!---\s*SEC:\s*(.*?)\s*--->$/);
        if (anchorMatch) {
            // 이전 섹션 저장
            if (inSection) {
                result.push({
                    id: generateId(),
                    title: currentTitle,
                    content: currentContent.join('\n').trim()
                });
            }
            
            // 새 섹션 시작
            currentTitle = anchorMatch[1];
            currentContent = [];
            inSection = true;
            continue;
        }
        
        // 본문 수집
        if (inSection) {
            currentContent.push(line);
        }
    }
    
    // 마지막 섹션 저장
    if (inSection) {
        result.push({
            id: generateId(),
            title: currentTitle,
            content: currentContent.join('\n').trim()
        });
    }
    
    return result.length > 0 ? result : [{
        id: generateId(),
        title: '',
        content: text.trim()
    }];
}

// ===== YouTube 패널 =====
const youtubeInput = document.getElementById('youtube-input');
const youtubeIframe = document.getElementById('youtube-iframe');
const youtubePanel = document.getElementById('youtube-panel');
const resizeHandle = document.getElementById('youtube-resize-handle');

// localStorage에서 YouTube 상태 복원
const savedYoutubeWidth = localStorage.getItem('youtubeWidth');
const savedYoutubeUrl = localStorage.getItem('youtubeUrl');

if (savedYoutubeWidth) {
    youtubePanel.style.width = savedYoutubeWidth + 'px';
}

if (savedYoutubeUrl) {
    youtubeInput.value = savedYoutubeUrl;
    const embedUrl = convertToEmbedUrl(savedYoutubeUrl);
    if (embedUrl) {
        youtubeIframe.src = embedUrl;
    }
}

// 리사이즈 기능
let isResizing = false;
let startX, startWidth;

resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = youtubePanel.offsetWidth;
    
    // 리사이즈 중 iframe 이벤트 차단
    youtubePanel.style.pointerEvents = 'none';
    e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    
    // 우상단 고정, 좌하단으로 늘어남
    const deltaX = startX - e.clientX; // 왼쪽으로 이동 = 너비 증가
    const newWidth = Math.max(200, Math.min(800, startWidth + deltaX)); // 200~800px 제한
    
    youtubePanel.style.width = newWidth + 'px';
});

document.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false;
        // iframe 이벤트 복구
        youtubePanel.style.pointerEvents = 'auto';
        // 크기 저장
        localStorage.setItem('youtubeWidth', youtubePanel.offsetWidth);
    }
});

youtubeInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        processYoutubeLink(youtubeInput.value.trim());
    }
});

youtubeInput.addEventListener('paste', function() {
    setTimeout(() => {
        processYoutubeLink(youtubeInput.value.trim());
    }, 0);
});

function processYoutubeLink(url) {
    if (!url) return;
    
    const embedUrl = convertToEmbedUrl(url);
    
    if (embedUrl) {
        youtubeIframe.src = embedUrl;
        // URL 저장
        localStorage.setItem('youtubeUrl', url);
    } else {
        showToast('유효한 YouTube 링크가 아닙니다');
    }
}

function convertToEmbedUrl(url) {
    // 불필요한 파라미터 제거용 URL 파싱
    let cleanUrl = url.split('&si=')[0].split('&feature=')[0].split('&index=')[0];
    
    // 재생목록 페이지: youtube.com/playlist?list=PLAYLIST_ID
    if (cleanUrl.includes('/playlist')) {
        const playlistMatch = cleanUrl.match(/[?&]list=([a-zA-Z0-9_-]+)/);
        if (playlistMatch) {
            return `https://www.youtube.com/embed/videoseries?list=${playlistMatch[1]}`;
        }
        return null;
    }
    
    // 영상 페이지: youtube.com/watch?v=VIDEO_ID (playlist 무시)
    const watchMatch = cleanUrl.match(/[?&]v=([a-zA-Z0-9_-]+)/);
    if (watchMatch) {
        return `https://www.youtube.com/embed/${watchMatch[1]}`;
    }
    
    // 단축 URL: youtu.be/VIDEO_ID
    const shortMatch = cleanUrl.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
    if (shortMatch) {
        return `https://www.youtube.com/embed/${shortMatch[1]}`;
    }
    
    return null;
}

// ===== 드래그 앤 드롭 =====
let dragCounter = 0;

window.addEventListener('dragenter', function(e) {
    e.preventDefault();
    dragCounter++;
    document.body.classList.add('drag-active');
});

window.addEventListener('dragleave', function(e) {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
        document.body.classList.remove('drag-active');
    }
});

window.addEventListener('dragover', function(e) {
    e.preventDefault();
});

window.addEventListener('drop', function(e) {
    e.preventDefault();
    document.body.classList.remove('drag-active');
    dragCounter = 0;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        
        if (!file.name.toLowerCase().endsWith('.txt')) {
            alert("txt 파일만 불러올 수 있습니다.");
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const text = e.target.result;
            
            // 섹션 파일인지 확인
            if (text.startsWith('<!--- NOVEL_SECTION --->')) {
                // 섹션 파일 → 바로 섹션 import 처리
                let content = text.replace('<!--- NOVEL_SECTION --->\n', '');
                
                const choice = confirm(
                    "섹션 파일을 감지했습니다.\n\n" +
                    "확인 = 현재 섹션의 내용을 대체합니다\n" +
                    "취소 = 새 섹션으로 추가합니다"
                );
                
                if (choice) {
                    // 현재 섹션 대체
                    sections[currentSectionIndex].content = content.trim();
                    loadSection(currentSectionIndex);
                    saveToFirebase();
                    showToast('현재 섹션을 업데이트했습니다');
                } else {
                    // 새 섹션 추가
                    const newSection = {
                        id: generateId(),
                        title: '',
                        content: content.trim()
                    };
                    sections.push(newSection);
                    currentSectionIndex = sections.length - 1;
                    
                    renderSectionList();
                    loadSection(currentSectionIndex);
                    saveToFirebase();
                    showToast('새 섹션을 추가했습니다');
                }
            } else {
                // 전체 파일 → 기존 로직
                processFile(file);
            }
        };
        reader.readAsText(file);
    }
});

// ===== 선택 영역 이동 기능 =====
const moveTextBtn = document.getElementById('move-text-btn');
const moveDropdown = document.getElementById('move-dropdown');

// 텍스트 선택 감지
editor.addEventListener('select', updateMoveButtonState);
editor.addEventListener('mouseup', updateMoveButtonState);
editor.addEventListener('keyup', updateMoveButtonState);

function updateMoveButtonState() {
    const hasSelection = editor.selectionStart !== editor.selectionEnd;
    moveTextBtn.disabled = !hasSelection;
    
    // 선택 해제되면 드롭다운도 닫기
    if (!hasSelection) {
        moveDropdown.classList.add('hidden');
    }
}

function toggleMoveDropdown() {
    if (moveDropdown.classList.contains('hidden')) {
        renderMoveDropdown();
        moveDropdown.classList.remove('hidden');
    } else {
        moveDropdown.classList.add('hidden');
    }
}

function renderMoveDropdown() {
    moveDropdown.innerHTML = '';
    
    // 새 섹션 옵션
    const newOption = document.createElement('div');
    newOption.className = 'move-option new-section';
    newOption.textContent = '+ 새 섹션으로';
    newOption.onclick = () => moveSelectionToNewSection();
    moveDropdown.appendChild(newOption);
    
    // 기존 섹션들
    sections.forEach((section, index) => {
        if (index === currentSectionIndex) return; // 현재 섹션 제외
        
        const option = document.createElement('div');
        option.className = 'move-option';
        const label = section.title ? `${index + 1}. ${section.title}` : `${index + 1}.`;
        option.textContent = label;
        option.onclick = () => moveSelectionToSection(index);
        moveDropdown.appendChild(option);
    });
}

function moveSelectionToNewSection() {
    const selectedText = getSelectedText();
    if (!selectedText) return;
    
    removeSelectedText();
    
    const newSection = {
        id: generateId(),
        title: '',
        content: selectedText,
        type: 'body'
    };
    
    sections.push(newSection);
    
    renderSectionList();
    saveToFirebase();
    moveDropdown.classList.add('hidden');
    showToast('새 섹션으로 이동됨');
}

function moveSelectionToSection(targetIndex) {
    const selectedText = getSelectedText();
    if (!selectedText) return;
    
    removeSelectedText();
    
    // 대상 섹션 끝에 추가 (줄바꿈 후)
    const target = sections[targetIndex];
    if (target.content) {
        target.content += '\n\n' + selectedText;
    } else {
        target.content = selectedText;
    }
    
    renderSectionList();
    saveToFirebase();
    moveDropdown.classList.add('hidden');
    
    const label = target.title ? `"${target.title}"` : `섹션 ${targetIndex + 1}`;
    showToast(`${label}(으)로 이동됨`);
}

function getSelectedText() {
    return editor.value.substring(editor.selectionStart, editor.selectionEnd);
}

function removeSelectedText() {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    
    editor.value = editor.value.substring(0, start) + editor.value.substring(end);
    sections[currentSectionIndex].content = editor.value;
    
    // 커서 위치 조정
    editor.selectionStart = editor.selectionEnd = start;
    updateCharCount();
}

// 드롭다운 바깥 클릭시 닫기
document.addEventListener('click', function(e) {
    if (!e.target.closest('.move-text-wrapper')) {
        moveDropdown.classList.add('hidden');
    }
});

// ===== 섹션별 Export =====
function exportSectionTxt() {
    saveCurrentSection();
    
    const section = sections[currentSectionIndex];
    if (!section || !section.content) {
        showToast('내보낼 내용이 없습니다');
        return;
    }
    
    // 메타데이터 + 본문만
    const fullText = `<!--- NOVEL_SECTION --->\n${section.content}`;
    
    // 파일명 생성
    const sectionTitle = section.title || `섹션${currentSectionIndex + 1}`;
    const safeTitle = sectionTitle.replace(/[\/\\?%*:|"<>]/g, '-');
    const date = new Date();
    const dateStr = `${date.getFullYear()}${(date.getMonth()+1).toString().padStart(2,'0')}${date.getDate().toString().padStart(2,'0')}`;
    const fileName = `${safeTitle}-${dateStr}.txt`;
    
    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    
    URL.revokeObjectURL(url);
    showToast(`저장됨: ${fileName}`);
}

// ===== 섹션별 Import =====
const sectionFileInput = document.getElementById('section-file-input');

function triggerSectionImport() {
    sectionFileInput.click();
}

function handleSectionFileSelect(event) {
    const file = event.target.files[0];
    if (file) processSectionFile(file);
    event.target.value = '';
}

function processSectionFile(file) {
    if (!file.name.toLowerCase().endsWith('.txt')) {
        alert("txt 파일만 불러올 수 있습니다.");
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        let text = e.target.result;
        
        // 메타데이터 제거 (있으면)
        if (text.startsWith('<!--- NOVEL_SECTION --->')) {
            text = text.replace('<!--- NOVEL_SECTION --->\n', '');
        }
        
        // 사용자 선택: 현재 섹션 대체 / 새 섹션 / 취소
        const choice = confirm(
            "어떻게 불러올까요?\n\n" +
            "확인 = 현재 섹션의 내용을 대체합니다\n" +
            "취소 = 새 섹션으로 추가합니다"
        );
        
        if (choice === null) return; // 실제로는 취소 버튼이 null을 반환하지 않지만 로직상 표현
        
        if (choice) {
            // 현재 섹션 대체
            sections[currentSectionIndex].content = text.trim();
            loadSection(currentSectionIndex);
            saveToFirebase();
            showToast('현재 섹션을 업데이트했습니다');
        } else {
            // 새 섹션 추가
            const newSection = {
                id: generateId(),
                title: '',
                content: text.trim(),
                type: 'body'
            };
            sections.push(newSection);
            currentSectionIndex = sections.length - 1;
            
            renderSectionList();
            loadSection(currentSectionIndex);
            saveToFirebase();
            showToast('새 섹션을 추가했습니다');
        }
    };
    reader.readAsText(file);
}

// ===== 섹션 드래그 앤 드롭 =====
let draggedSectionIndex = null;

function handleSectionDragStart(e) {
    draggedSectionIndex = parseInt(e.currentTarget.dataset.index);
    e.currentTarget.style.opacity = '0.4';
    e.dataTransfer.effectAllowed = 'move';
}

function handleSectionDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    
    const targetItem = e.currentTarget;
    const targetIndex = parseInt(targetItem.dataset.index);
    
    // 드래그 중인 아이템과 다른 아이템 위에 있을 때만 표시
    if (draggedSectionIndex !== targetIndex) {
        targetItem.style.borderTop = '2px solid #007bff';
    }
    
    return false;
}

function handleSectionDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    
    const targetIndex = parseInt(e.currentTarget.dataset.index);
    
    if (draggedSectionIndex !== null && draggedSectionIndex !== targetIndex) {
        saveCurrentSection();
        
        // 배열에서 아이템 이동
        const [removed] = sections.splice(draggedSectionIndex, 1);
        sections.splice(targetIndex, 0, removed);
        
        // 현재 인덱스 업데이트
        if (currentSectionIndex === draggedSectionIndex) {
            currentSectionIndex = targetIndex;
        } else if (draggedSectionIndex < currentSectionIndex && targetIndex >= currentSectionIndex) {
            currentSectionIndex--;
        } else if (draggedSectionIndex > currentSectionIndex && targetIndex <= currentSectionIndex) {
            currentSectionIndex++;
        }
        
        renderSectionList();
        saveToFirebase();
        showToast('섹션 순서가 변경되었습니다');
    }
    
    return false;
}

function handleSectionDragEnd(e) {
    e.currentTarget.style.opacity = '1';
    
    // 모든 아이템의 border 초기화
    document.querySelectorAll('.section-item').forEach(item => {
        item.style.borderTop = '';
    });
    
    draggedSectionIndex = null;
}
