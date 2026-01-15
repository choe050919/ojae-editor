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
    countDisplay.innerText = editor.value.length.toLocaleString();
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
