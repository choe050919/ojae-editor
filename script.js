const titleInput = document.getElementById('novel-title');
const editor = document.getElementById('novel-editor');
const countDisplay = document.getElementById('char-count');
const toast = document.getElementById('toast');
const fileInput = document.getElementById('file-input');

// 키 값 분리 (제목용, 본문용)
const KEY_TITLE = 'novel_title';
const KEY_CONTENT = 'novel_draft';

// 1. 초기 로드
window.onload = function() {
    const savedTitle = localStorage.getItem(KEY_TITLE);
    const savedContent = localStorage.getItem(KEY_CONTENT);

    if (savedTitle) titleInput.value = savedTitle;
    if (savedContent) {
        editor.value = savedContent;
        updateCharCount();
    }
};

// 2. 입력 감지 (제목 & 본문) -> 자동 저장
function handleInput() {
    // 본문 글자수 갱신
    updateCharCount();
    // 저장
    saveDataSilent();
}

editor.addEventListener('input', handleInput);
titleInput.addEventListener('input', handleInput); // 제목도 칠 때마다 저장

function updateCharCount() {
    countDisplay.innerText = editor.value.length.toLocaleString();
}

function saveDataSilent() {
    localStorage.setItem(KEY_TITLE, titleInput.value);
    localStorage.setItem(KEY_CONTENT, editor.value);
}

function showToast(message) {
    toast.innerText = message;
    toast.className = "show";
    setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 2000);
}

// 3. 내보내기 (Export) - 파일명 생성 로직 변경
function exportData() {
    const content = editor.value;
    const title = titleInput.value.trim(); // 공백 제거

    if (!content && !title) {
        alert("내보낼 내용이 없습니다.");
        return;
    }

    // 저장할 데이터 객체
    const data = {
        title: title,
        content: content,
        savedAt: new Date().toISOString()
    };

    // 파일명 생성: 제목-날짜.json
    // 제목이 없으면 '무제' 사용, 파일명에 못 쓰는 특수문자는 제거
    const safeTitle = (title || "무제").replace(/[\/\\?%*:|"<>]/g, '-');
    const date = new Date();
    const dateStr = `${date.getFullYear()}${(date.getMonth()+1).toString().padStart(2,'0')}${date.getDate()}`; // YYYYMMDD
    const fileName = `${safeTitle}-${dateStr}.json`;

    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    
    URL.revokeObjectURL(url);
    showToast(`파일로 내보냈습니다: ${fileName}`);
}

// 4. 가져오기 (Import)
function triggerImport() {
    fileInput.click();
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) processFile(file);
    event.target.value = ''; 
}

function processFile(file) {
    if (!file.name.toLowerCase().endsWith('.json')) {
        alert("JSON 파일만 불러올 수 있습니다.");
        return;
    }

    const userConfirmed = confirm("현재 작성 중인 제목과 내용이 파일 내용으로 덮어씌워집니다.\n계속하시겠습니까?");
    if (!userConfirmed) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            // 데이터 유효성 검사
            if (typeof data.content === 'undefined') {
                throw new Error("올바르지 않은 파일 형식입니다.");
            }

            // 제목과 본문 모두 복구
            titleInput.value = data.title || ""; // 제목이 없으면 빈칸
            editor.value = data.content;

            saveDataSilent(); // 로컬스토리지 동기화
            updateCharCount();
            showToast("성공적으로 불러왔습니다!");
            
        } catch (error) {
            alert("파일 불러오기 실패: " + error.message);
        }
    };
    reader.readAsText(file);
}

// 5. 드래그 앤 드롭 (화면 전체)
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

// 단축키 (Ctrl+S) 시각적 피드백
window.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        saveDataSilent();
        showToast("저장되었습니다");
    }
});