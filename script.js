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
const titleInput = document.getElementById('novel-title');
const editor = document.getElementById('novel-editor');
const countDisplay = document.getElementById('char-count');
const toast = document.getElementById('toast');
const syncStatus = document.getElementById('sync-status');
const myLinkInput = document.getElementById('my-link');

// 문서 ID (URL 해시에서 가져오거나 새로 생성)
let docId = window.location.hash.slice(1);

if (!docId) {
    // 새 ID 생성 (랜덤 12자리)
    docId = generateId();
    window.location.hash = docId;
}

// 링크 표시
myLinkInput.value = window.location.href;

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

// 데이터 불러오기 (실시간 동기화)
docRef.on('value', (snapshot) => {
    const data = snapshot.val();
    
    if (data) {
        // 현재 커서 위치 저장
        const cursorPos = editor.selectionStart;
        const hadFocus = document.activeElement === editor;
        
        // 값이 다를 때만 업데이트 (타이핑 중 깜빡임 방지)
        if (titleInput.value !== data.title && document.activeElement !== titleInput) {
            titleInput.value = data.title || '';
        }
        if (editor.value !== data.content && document.activeElement !== editor) {
            editor.value = data.content || '';
        }
        
        updateCharCount();
    }
    
    syncStatus.textContent = '동기화됨 ✓';
    syncStatus.classList.add('synced');
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

// 저장 타이머 (디바운스)
let saveTimer = null;

function handleInput() {
    updateCharCount();
    
    // 상태 표시
    syncStatus.textContent = '저장 중...';
    syncStatus.classList.remove('synced');
    
    // 디바운스: 0.5초 후 저장
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveToFirebase, 500);
}

function saveToFirebase() {
    docRef.set({
        title: titleInput.value,
        content: editor.value,
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
titleInput.addEventListener('input', handleInput);

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

// Ctrl+S 방지 (자동저장이라 불필요)
window.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        showToast('자동 저장됩니다');
    }
});
