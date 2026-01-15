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

// 데이터 불러오기
docRef.on('value', (snapshot) => {
    const data = snapshot.val();
    isLoadingFromServer = true;
    
    if (data && data.sections) {
        // 새 형식 (섹션 있음)
        sections = data.sections;
        novelTitle = data.title || '';
    } else if (data && data.content !== undefined) {
        // 기존 형식 -> 마이그레이션
        novelTitle = data.title || '';
        sections = [{
            id: generateId(),
            title: '',
            content: data.content
        }];
        // 서버에 새 형식으로 저장
        saveToFirebase();
    } else {
        // 새 문서
        novelTitle = '';
        sections = [{
            id: generateId(),
            title: '',
            content: ''
        }];
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
        item.className = 'section-item' + (index === currentSectionIndex ? ' active' : '');
        
        const label = document.createElement('span');
        label.className = 'section-label';
        const displayTitle = section.title ? `${index + 1}. ${section.title}` : `${index + 1}.`;
        label.textContent = displayTitle;
        label.onclick = () => switchSection(index);
        
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
        content: ''
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

// 링크 복사
function copyLink() {
    myLinkInput.select();
    document.execCommand('copy');
    showToast('링크가 복사되었습니다');
}

// 텍스트 파일로 내보내기 (모든 섹션 합침)
function exportTxt() {
    saveCurrentSection();
    
    if (sections.length === 0 || (sections.length === 1 && !sections[0].content)) {
        showToast('내보낼 내용이 없습니다');
        return;
    }
    
    // 모든 섹션 합치기
    let fullText = '';
    sections.forEach((section, index) => {
        if (index > 0) {
            fullText += '\n\n';
        }
        
        // 섹션 헤더
        if (section.title) {
            fullText += `${index + 1}. ${section.title}\n`;
        } else {
            fullText += `${index + 1}.\n`;
        }
        
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

    const userConfirmed = confirm("현재 작성 중인 모든 섹션이 파일 내용으로 대체됩니다.\n계속하시겠습니까?");
    if (!userConfirmed) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const parsed = parseTxtToSections(text);
        
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

// ===== YouTube 패널 =====
const youtubeInput = document.getElementById('youtube-input');
const youtubeIframe = document.getElementById('youtube-iframe');

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
        processFile(files[0]);
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
        content: selectedText
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
