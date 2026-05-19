import {
    db,
    messaging,
    collection,
    addDoc,
    onSnapshot,
    query,
    orderBy,
    deleteDoc,
    doc,
    updateDoc,
    getDocs,
    setDoc
} from "./firebase-config.js";

import {
    getToken
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";



let currentSystem = 'exchange';
let currentView = 'home';
let currentData = [];
let unsubscribe = null;
let selectedAccountFilter = '';
let isSaving = false;
let systemStoredBalance = 0; // سيتم جلبه من الداتابيز

let initialLoadCompleted = false;

const SYSTEM_SETTINGS_COLLECTION = 'system_settings';
const SYSTEM_BALANCE_LOGS_COLLECTION = 'system_balance_logs';
const MAX_BALANCE_LOGS = 10;


const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const confirmModal = new bootstrap.Modal(document.getElementById('confirmModal'));

// تهيئة قائمة البحث الذكية (Select2) بالخيار العربي
$(document).ready(function () {
    // تهيئة Select2 للحساب داخل النموذج
    $('#accountName').select2({
        dir: "rtl",
        dropdownParent: $('#formSection')
    });

    // عند تغيير الحساب حدث السلايدر
    $('#accountName').on('change', function () {
        updateCommissionSlider();
    });

    // تهيئة Select2 لفلتر الحساب
    $('#accountFilter').select2({
        dir: "rtl",
        placeholder: "كل الحسابات",
        allowClear: true,
        width: '100%'
    });

    // عند تغيير الفلتر
    $('#accountFilter').on('change', function () {
        selectedAccountFilter = $(this).val() || '';
        renderTable();
    });

    // عند تغيير المبلغ حدث السلايدر
    $('#amount').on('input', function () {
        updateCommissionSlider();
    });

    // تشغيل أولي عند تحميل الصفحة
    setTimeout(() => {
        updateCommissionSlider();
    }, 100);
});

const themes = [
    'light',    // الفاتح النقي
    'dark',     // الداكن الفخم
    'blue',     // المحيط الأزرق
    'emerald',  // الزمردي الملكي
    'purple',   // الشروق الأرجواني
    'gold',     // الذهب الملكي
    'sahara',   // الصحراء الدافئ
    'cyber'     // النيون السايبر
];

window.cycleTheme = () => {
    let current = document.body.getAttribute('data-theme') || 'light';
    let next = themes[(themes.indexOf(current) + 1) % themes.length];
    document.body.setAttribute('data-theme', next);
    localStorage.setItem('labwa-theme', next);

    const themeNames = {
        light: '☀️ الفاتح النقي',
        dark: '🌙 الداكن الفخم',
        blue: '🌊 المحيط الأزرق',
        emerald: '💚 الزمردي الملكي',
        purple: '🟣 الشروق الأرجواني',
        gold: '👑 الذهب الملكي',
        sahara: '🏜️ الصحراء الدافئ',
        cyber: '⚡ النيون السايبر'
    };

    showToast(`تم تفعيل الثيم: ${themeNames[next]}`, 'info');
};

const toggleSidebar = () => {
    sidebar.classList.toggle('active');
    overlay.style.display = sidebar.classList.contains('active') ? 'block' : 'none';
};

document.getElementById('toggleSidebar').onclick = toggleSidebar;
overlay.onclick = toggleSidebar;

window.showView = async (view, btn) => {
    currentView = view;

    // ==========================================
    // تحديث شكل أزرار التنقل
    // ==========================================
    const viewButtons = document.querySelectorAll('[id^="btn-view-"]');
    viewButtons.forEach(button => {
        button.classList.remove('active-view');
    });

    if (btn) {
        btn.classList.add('active-view');
    } else {
        const targetBtn = document.getElementById(`btn-view-${view}`);
        if (targetBtn) targetBtn.classList.add('active-view');
    }

    // ==========================================
    // تحديث عنوان الصفحة
    // ==========================================
    const viewNames = {
        home: 'الرئيسية',
        reports: 'التحليلات والتقارير',
        match: 'مطابقة الدولار ⚖️'
    };

    document.getElementById('currentViewName').innerText =
        viewNames[view] || '';

    // ==========================================
    // إظهار/إخفاء زر مسح السجل الكامل
    // ==========================================
    const deleteBtn = document.getElementById('btnDeleteRegister');

    if (deleteBtn) {
        deleteBtn.style.display =
            (view === 'match') ? 'none' : 'block';
    }

    // ==========================================
    // إذا انتقلنا إلى صفحة المطابقة
    // يجب أولاً التحويل إلى نظام التصريف
    // ثم انتظار تحميل البيانات
    // ==========================================
    if (view === 'match') {
        // إذا كنا في نظام الحركات المالية
        if (currentSystem !== 'exchange') {
            currentSystem = 'exchange';

            // تحديث عنوان النظام
            const systemTitle =
                document.getElementById('currentSystemTitle');

            if (systemTitle) {
                systemTitle.innerText = 'نظام التصريف';
            }

            // تحديث أزرار النظام
            document
                .querySelectorAll('[id^="btn-sys-"]')
                .forEach(btn => btn.classList.remove('active-system'));

            const exchangeBtn =
                document.getElementById('btn-sys-exchange');

            if (exchangeBtn) {
                exchangeBtn.classList.add('active-system');
            }

            // تحميل بيانات التصريف وانتظار اكتمالها
            if (typeof loadData === 'function') {
                await loadData();
            }
        }
    }

    // ==========================================
    // إخفاء جميع الأقسام
    // ==========================================
    const sections = [
        'formSection',
        'tableSection',
        'reportsSection',
        'matchSection'
    ];

    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // ==========================================
    // إخفاء الكروت الإضافية
    // ==========================================
    const extraCards = [
        'lastActionAndStats',
        'weightedAverageCards',
        'accountFilterWrapper'
    ];

    extraCards.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // ==========================================
    // الصفحة الرئيسية
    // ==========================================
    if (view === 'home') {
        document.getElementById('formSection').style.display = 'block';
        document.getElementById('tableSection').style.display = 'block';
        document.getElementById('lastActionAndStats').style.display =
            'block';

        if (currentSystem === 'cash') {
            document.getElementById(
                'accountFilterWrapper'
            ).style.display = 'block';
        }
    }

    // ==========================================
    // صفحة التقارير
    // ==========================================
    else if (view === 'reports') {
        document.getElementById('reportsSection').style.display =
            'block';

        if (currentSystem === 'exchange') {
            document.getElementById(
                'weightedAverageCards'
            ).style.display = 'block';
        }

        if (typeof renderReports === 'function') {
            renderReports();
        }
    }

    // ==========================================
    // صفحة مطابقة الدولار
    // ==========================================
    else if (view === 'match') {
        document.getElementById('matchSection').style.display =
            'block';

        // التأكد من أن currentData أصبح يحتوي
        // على بيانات exchange_movements
        if (typeof renderMatchView === 'function') {
            await renderMatchView();
        }
    }

    // ==========================================
    // إغلاق القائمة الجانبية في الهاتف
    // ==========================================
    if (
        window.innerWidth < 768 &&
        sidebar &&
        sidebar.classList.contains('active')
    ) {
        toggleSidebar();
    }
};

window.switchSystem = (system, btn) => {
    currentSystem = system;
    document.getElementById('currentSystemTitle').innerText = system === 'exchange' ? 'نظام التصريف' : 'نظام الحركات المالية';

    document.getElementById('btn-sys-exchange').classList.remove('active-system');
    document.getElementById('btn-sys-cash').classList.remove('active-system');
    if (btn) {
        btn.classList.add('active-system');
    } else {
        document.getElementById(`btn-sys-${system}`).classList.add('active-system');
    }

    if (system === 'exchange') {
        document.getElementById('labelType2').innerText = 'شراء 📉'; // الأول
        document.getElementById('labelType1').innerText = 'بيع 📈';   // الثاني
        document.getElementById('rateGroup').style.display = 'block';
        document.getElementById('accountGroup').style.display = 'none';
    } else {
        document.getElementById('labelType2').innerText = 'قبض 📥';  // الأول
        document.getElementById('labelType1').innerText = 'صرف 📤';  // الثاني
        document.getElementById('rateGroup').style.display = 'none';
        document.getElementById('accountGroup').style.display = 'block';
        setTimeout(updateCommissionSlider, 100);
    }

    showView('home');
    updateCommissionSlider();
    selectedAccountFilter = '';
    initDataListener();
};

// ============================================
// تنسيق الأرقام
// في الحركات المالية:
// - إذا كتب المستخدم 1 لأول مرة تصبح 1,000
// - إذا كتب 15 تصبح 15,000
// - إذا كتب 150 تصبح 150,000
// - إذا بدأ يحذف الرقم، لا تتم إضافة أصفار مرة أخرى
// ============================================

function formatDateTime(dateValue) {
    try {
        let date;

        // إذا كانت القيمة Firestore Timestamp
        if (dateValue?.toDate) {
            date = dateValue.toDate();
        } else {
            date = new Date(dateValue);
        }

        return date.toLocaleString('ar-IQ', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return '-';
    }
}

function formatNumber(num, allowDecimal = false) {
    if (num === null || num === undefined || num === '') return '';

    // تحويل القيمة إلى نص وإزالة الفواصل
    let str = num.toString().replace(/,/g, '').trim();

    // ==============================
    // السماح بالكسور العشرية
    // ==============================
    if (allowDecimal) {
        // حذف أي شيء غير الأرقام والنقطة
        str = str.replace(/[^\d.]/g, '');

        // السماح بنقطة واحدة فقط
        const parts = str.split('.');
        if (parts.length > 2) {
            str = parts[0] + '.' + parts.slice(1).join('');
        }

        // إذا كانت القيمة فارغة
        if (str === '' || str === '.') return '';

        const [integerPart, decimalPart] = str.split('.');

        const formattedInteger = (integerPart || '0')
            .replace(/\B(?=(\d{3})+(?!\d))/g, ',');

        return decimalPart !== undefined
            ? `${formattedInteger}.${decimalPart}`
            : formattedInteger;
    }

    // ==============================
    // تنسيق الأعداد الصحيحة
    // ==============================
    let clean = str.replace(/\D/g, '');
    if (clean === '') return '';

    return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

document.querySelectorAll('.number-format').forEach(input => {

    const isRateField = input.id === 'rate';

    input.addEventListener('focus', (e) => {
        if (e.target.value === '0') {
            e.target.value = '';
        }
    });

    input.addEventListener('blur', (e) => {
        if (e.target.value.trim() === '') {
            e.target.value = '0';
        }
    });

    input.addEventListener('input', (e) => {
        let value = e.target.value;

        // سعر التصريف يسمح بالنقطة
        if (isRateField) {
            e.target.value = formatNumber(value, true);
        } else {
            let rawValue = value.replace(/\D/g, '');

            if (rawValue === '') {
                e.target.value = '';
                return;
            }

            e.target.value = formatNumber(rawValue);
        }

        // تحديث معاينة المبلغ عند الكتابة
        if (input.id === 'amount') {
            updateAmountPreview();
        }
    });
});

function createAmountPreview() {
    if (document.getElementById('amountPreviewBadge')) return;

    const badge = document.createElement('div');

    badge.id = 'amountPreviewBadge';
    badge.style.cssText = `
        position: fixed;
        top: 15px; /* رفعناه للأعلى أكثر ليناسب كل الشاشات */
        left: 50%;
        transform: translateX(-50%) translateY(-20px);
        z-index: 100000; /* رفعنا الرقم ليكون فوق كل شيء حتى لوحة المفاتيح */
        background: linear-gradient(135deg, #0d6efd, #0a58ca);
        color: #fff;
        padding: 10px 25px;
        border-radius: 50px; /* جعلناه بيضوي أكثر ليظهر كأنه طائف */
        font-size: 1.2rem;
        font-weight: 800;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: all 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        border: 2px solid rgba(255,255,255,0.2);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        text-align: center;
        direction: rtl;
    `;

    document.body.appendChild(badge);
}

document.addEventListener('DOMContentLoaded', () => {
    // إنشاء معاينة المبلغ
    createAmountPreview();

    // تشغيل مستمع البيانات
    initDataListener();

    // تحديث الشارة عند الكتابة
    document
        .getElementById('amount')
        ?.addEventListener('input', updateAmountPreview);

    // تشغيل إعداد الإشعارات بعد اكتمال تحميل الصفحة
    // وتأخير بسيط حتى يختفي اللودر وتستقر الصفحة
    window.addEventListener('load', () => {
        setTimeout(() => {
            initPushNotifications();
        }, 2500);
    });
});

function updateAmountPreview() {
    const badge = document.getElementById('amountPreviewBadge');
    const amountInput = document.getElementById('amount');

    if (!badge || !amountInput) return;

    const raw = parseNumber(amountInput.value);

    if (raw <= 0) {
        badge.style.opacity = '0';
        badge.style.transform = 'translateX(-50%) translateY(-20px)';
        return;
    }

    const currency = currentSystem === 'exchange' ? '$' : 'د.ع';

    badge.innerHTML = `
        <div style="font-size: 0.8rem; opacity: 0.9; margin-bottom: 4px;">
            المبلغ الحالي
        </div>
        <div style="font-size: 1.5rem; font-weight: 900; letter-spacing: 0.5px;">
            ${formatNumber(raw)} ${currency}
        </div>
    `;

    badge.style.opacity = '1';
    badge.style.transform = 'translateX(-50%) translateY(0)';

    clearTimeout(window.amountPreviewTimeout);
    window.amountPreviewTimeout = setTimeout(() => {
        badge.style.opacity = '0';
        badge.style.transform = 'translateX(-50%) translateY(-20px)';
    }, 2500);
}

function initDataListener() {
    if (unsubscribe) unsubscribe();

    // إعادة ضبط أول تحميل عند تبديل النظام
    initialLoadCompleted = false;

    const colName =
        currentSystem === 'exchange'
            ? 'exchange_movements'
            : 'cash_movements';

    const q = query(
        collection(db, colName),
        orderBy('timestamp', 'desc')
    );

    unsubscribe = onSnapshot(q, (snapshot) => {
        currentData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        updateAccountFilter();
        renderTable();

        if (currentView === 'reports') renderReports();

        updateLastActionAndStats();

        if (currentSystem === 'exchange') {
            loadRateSuggestions();
        }

        // إرسال إشعار فقط بعد أول تحميل
        if (initialLoadCompleted) {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    showBrowserNotification(data, currentSystem);
                }
            });
        }

        // اعتبار التحميل الأول مكتملًا
        initialLoadCompleted = true;

        const loader = document.getElementById('loader');
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => {
                loader.style.display = 'none';
            }, 500);
        }

    }, (error) => {
        showToast("فشل الاتصال الفوري بقاعدة البيانات ❌", "danger");
    });
}

function loadRateSuggestions() {
    const isType1Checked = document.getElementById('type1').checked;
    const activeType = isType1Checked ? 'بيع' : 'شراء';
    const suggestionsContainer = document.getElementById('rateSuggestions');

    if (!suggestionsContainer) return;

    const rates = currentData
        .filter(item => item.type === activeType && item.rate && parseFloat(item.rate) > 0)
        .map(item => item.rate);

    const uniqueRates = [...new Set(rates)].slice(0, 3);

    if (uniqueRates.length === 0) {
        suggestionsContainer.innerHTML = `<small class="text-muted" style="font-size: 0.75rem;">لا توجد أسعار سابقة مسجلة لعملية الـ ${activeType} حالياً.</small>`;
        return;
    }

    let html = `<small class="text-secondary fw-bold me-1" style="font-size: 0.8rem;">أسعار سابقة:</small>`;
    uniqueRates.forEach(r => {
        html += `
                    <button type="button" class="btn btn-sm btn-light border py-1 px-2.5 rounded-pill shadow-sm text-primary fw-bold animate__animated animate__fadeIn" 
                            style="font-size: 0.8rem; background: rgba(var(--bs-primary-rgb), 0.05); transition: all 0.2s;"
                            onclick="applySuggestedRate('${r}')">
                        ${formatNumber(r, true)}
                    </button>
                `;
    });
    suggestionsContainer.innerHTML = html;
}

document.getElementById('type1').addEventListener('change', loadRateSuggestions);
document.getElementById('type2').addEventListener('change', loadRateSuggestions);

window.applySuggestedRate = (rateValue) => {
    const rateInput = document.getElementById('rate');
    rateInput.value = formatNumber(rateValue, true);
    rateInput.classList.add('animate__animated', 'animate__flash');
    setTimeout(() => rateInput.classList.remove('animate__animated', 'animate__flash'), 600);
    showToast(`تم تطبيق سعر الصرف: ${formatNumber(rateValue, true)} ⚡`, 'info');
};


function parseNumber(value) {
    return parseFloat((value || "0").toString().replace(/,/g, '')) || 0;
}

function updateCommissionSlider() {
    const section = document.getElementById('commissionSection');
    const slider = document.getElementById('commissionSlider');
    const valueLabel = document.getElementById('commissionValue');
    const maxLabel = document.getElementById('commissionMaxLabel');

    if (!section || !slider) return;

    // يظهر فقط في نظام الحركات المالية
    if (currentSystem !== 'cash') {
        section.style.display = 'none';
        slider.value = 0;
        valueLabel.textContent = '0 د.ع';
        return;
    }

    const account = $('#accountName').val();

    // إخفاء العمولة لحساب دولار المسافرين
    if (account === 'دولار المسافرين') {
        section.style.display = 'none';
        slider.value = 0;
        valueLabel.textContent = '0 د.ع';
        return;
    }

    const amount = parseNumber(document.getElementById('amount').value);

    // إذا لا يوجد مبلغ
    if (amount <= 0) {
        section.style.display = 'none';
        slider.value = 0;
        valueLabel.textContent = '0 د.ع';
        return;
    }

    // كل مليون أو جزء منه = 4000
    const millions = Math.ceil(amount / 1000000);
    const maxCommission = millions * 4000;

    section.style.display = 'block';

    slider.min = 0;
    slider.max = maxCommission;
    slider.step = 500;

    // إذا القيمة الحالية أكبر من الحد الأعلى
    if (parseInt(slider.value || 0) > maxCommission) {
        slider.value = 0;
    }

    valueLabel.textContent = `${formatNumber(slider.value)} د.ع`;
    maxLabel.textContent = formatNumber(maxCommission);
}

document.getElementById('commissionSlider').addEventListener('input', function () {
    document.getElementById('commissionValue').textContent =
        `${formatNumber(this.value)} د.ع`;
});

// تحديث السلايدر عند تغيير المبلغ
document.getElementById('amount').addEventListener('input', updateCommissionSlider);

// تحديث السلايدر عند تغيير الحساب
$('#accountName').on('change', updateCommissionSlider);


document.getElementById('mainForm').onsubmit = async (e) => {
    e.preventDefault();
    const amountValue = parseNumber(document.getElementById('amount').value);

    if (amountValue <= 0) {
        playFailureSound();
        showToast('لا يمكن حفظ حركة بمبلغ صفر ❌', 'danger');
        return;
    }

    if (isSaving) return;
    isSaving = true;

    const btnSave = document.getElementById('btnSave');
    btnSave.disabled = true;
    btnSave.innerHTML = `
                        <span class="spinner-border spinner-border-sm me-2"></span>
                        جاري الحفظ...
                    `;

    const editId = document.getElementById('editDocId').value;

    // تصحيح المنطق هنا: type1 هو الأول (بيع/قبض) و type2 هو الثاني (شراء/صرف)
    let typeValue;
    if (currentSystem === 'exchange') {
        typeValue = document.getElementById('type1').checked ? 'بيع' : 'شراء';
    } else {
        typeValue = document.getElementById('type1').checked ? 'صرف' : 'قبض';
        // ملاحظة: إذا كانت الواجهة لديك تعرض "قبض" كخيار أول، اجعلها 'قبض' هنا.
        // بناءً على وصفك للمشكلة، قمنا بتبديلهم ليعملوا بشكل صحيح.
    }

    const data = {
        type: typeValue,
        amount: document.getElementById('amount').value.replace(/,/g, '') || "0",
        commission: document.getElementById('commissionSlider')?.value || "0",
        timestamp: new Date()
    };

    if (currentSystem === 'exchange') {
        data.rate = document.getElementById('rate').value.replace(/,/g, '') || "0";
    } else {
        data.account = $('#accountName').val() || '';
    }

    try {
        const col = currentSystem === 'exchange'
            ? 'exchange_movements'
            : 'cash_movements';

        if (editId) {
            await updateDoc(doc(db, col, editId), data);
            playSuccessSound();
            showToast('تم تحديث البيانات بنجاح 🔥', 'success');
        } else {
            await addDoc(collection(db, col), data);
            playSuccessSound();
            showToast('تمت إضافة السجل بنجاح ✅', 'success');
        }

        resetForm();

    } catch (error) {
        playFailureSound();
        showToast('حدث خطأ أثناء الحفظ ❌', 'danger');

    } finally {
        isSaving = false;
        btnSave.disabled = false;

        // إعادة النص المناسب للزر
        if (document.getElementById('editDocId').value) {
            btnSave.innerHTML =
                '<i class="bi bi-pencil-fill me-2"></i> تحديث السجل الآن';
            btnSave.className =
                'btn btn-modern btn-info w-100 fs-5 text-white shadow-sm';
        } else {
            btnSave.innerHTML =
                '<i class="bi bi-cloud-arrow-up-fill me-2"></i> حفظ السجل الآن';
            btnSave.className =
                'btn btn-modern btn-success w-100 fs-5 py-3 shadow';
        }
    }
};

function resetForm() {
    document.getElementById('mainForm').reset();
    document.getElementById('editDocId').value = '';
    document.getElementById('amount').value = '0';
    document.getElementById('rate').value = '0';

    // إعادة تعيين Select2 للخيار الأول تلقائياً
    $('#accountName').val($('#accountName option:first').val()).trigger('change');

    document.getElementById('btnSave').innerHTML = '<i class="bi bi-cloud-arrow-up-fill me-2"></i> حفظ السجل الآن';
    document.getElementById('btnSave').className = 'btn btn-modern btn-success w-100 fs-5';
    loadRateSuggestions();

    document.getElementById('commissionSlider').value = 0;
    document.getElementById('commissionValue').textContent = '0 د.ع';
    updateCommissionSlider();
    updateAmountPreview();

}

function renderWeightedAverage(data) {
    // 1. تصفية العمليات التي تحتوي على سعر تصريف فقط (لأنها نظام exchange)
    const exchangeData = data.filter(d => d.rate && parseNumber(d.rate) > 0);

    // 2. التصفية بناءً على المسميات الحقيقية في قاعدة بياناتك (شراء و بيع)
    const buyOps = exchangeData.filter(d => d.type === 'شراء');
    const sellOps = exchangeData.filter(d => d.type === 'بيع');

    // 3. حسبة الشراء باستخدام parseNumber لضمان قراءة الأرقام بشكل صحيح
    const totalBuyAmount = buyOps.reduce((sum, d) => sum + parseNumber(d.amount), 0);
    const totalBuyLocal = buyOps.reduce((sum, d) => sum + (parseNumber(d.amount) * parseNumber(d.rate)), 0);
    const avgBuyRate = totalBuyAmount > 0 ? (totalBuyLocal / totalBuyAmount) : 0;

    // 4. حسبة البيع
    const totalSellAmount = sellOps.reduce((sum, d) => sum + parseNumber(d.amount), 0);
    const totalSellLocal = sellOps.reduce((sum, d) => sum + (parseNumber(d.amount) * parseNumber(d.rate)), 0);
    const avgSellRate = totalSellAmount > 0 ? (totalSellLocal / totalSellAmount) : 0;

    const container = document.getElementById('weightedAverageCards');
    if (!container) return;

    container.innerHTML = `
        <div class="row g-3 mb-4 animate__animated animate__fadeIn">
            <div class="col-md-6">
                <div class="card border-0 shadow-sm bg-danger bg-opacity-10 border-start border-danger border-5">
                    <div class="card-body py-3">
                        <div class="small fw-bold text-danger mb-1">معدل سعر الشراء 📉</div>
                        <div class="d-flex justify-content-between align-items-center">
                            <h4 class="m-0 fw-bold text-dark">$${formatNumber(totalBuyAmount)}</h4>
                            <span class="badge bg-danger fs-6">${avgBuyRate.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card border-0 shadow-sm bg-primary bg-opacity-10 border-start border-primary border-5">
                    <div class="card-body py-3">
                        <div class="small fw-bold text-primary mb-1">معدل سعر البيع 📈</div>
                        <div class="d-flex justify-content-between align-items-center">
                            <h4 class="m-0 fw-bold text-dark">$${formatNumber(totalSellAmount)}</h4>
                            <span class="badge bg-primary fs-6">${avgSellRate.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function updateAccountFilter() {
    const wrapper = document.getElementById('accountFilterWrapper');
    const select = $('#accountFilter');
    const suggestions = document.getElementById('accountSuggestions');

    if (!wrapper || !select.length || !suggestions) return;

    // يظهر فقط في نظام الحركات المالية
    if (currentSystem !== 'cash') {
        wrapper.style.display = 'none';
        selectedAccountFilter = '';
        return;
    }

    wrapper.style.display = 'block';

    const selectContainer = document.getElementById('accountFilter')
        ?.closest('.col-lg-6');

    if (selectContainer) {
        selectContainer.style.display = 'none';
    }

    // استخراج الحسابات المستخدمة فقط
    const accounts = [...new Set(
        currentData
            .map(item => item.account)
            .filter(Boolean)
    )];

    // تعبئة Select2
    let options = '<option value="">كل الحسابات</option>';

    accounts.forEach(account => {
        options += `<option value="${account}">${account}</option>`;
    });

    select.html(options);

    // الحفاظ على القيمة الحالية إن وجدت
    select.val(selectedAccountFilter).trigger('change.select2');

    // إنشاء الاقتراحات السريعة
    if (accounts.length === 0) {
        suggestions.innerHTML = `
            <small class="text-muted">
                لا توجد حسابات مسجلة حالياً
            </small>
        `;
        return;
    }

    let html = `
        <button type="button"
                class="btn btn-sm ${selectedAccountFilter === '' ? 'btn-primary' : 'btn-light border'} rounded-pill"
                onclick="applyAccountFilter('')">
            الكل
        </button>
    `;

    accounts.slice(0, 10).forEach(account => {
        const active = selectedAccountFilter === account;

        html += `
            <button type="button"
                    class="btn btn-sm ${active ? 'btn-primary' : 'btn-light border'} rounded-pill"
                    onclick="applyAccountFilter('${account.replace(/'/g, "\\'")}')">
                ${account}
            </button>
        `;
    });

    suggestions.innerHTML = html;
}

window.applyAccountFilter = function (account) {
    selectedAccountFilter = account;

    $('#accountFilter')
        .val(account || '')
        .trigger('change.select2');

    renderTable();
};

function renderTable() {
    const head = document.getElementById('tableHeader');
    const body = document.getElementById('dataTableBody');

    let filteredData = currentData;

    if (currentSystem === 'cash' && selectedAccountFilter) {
        filteredData = currentData.filter(
            item => item.account === selectedAccountFilter
        );
    }

    document.getElementById('rowCount').innerText =
        `${filteredData.length} عملية مسجلة`;

    document.getElementById('rowCount').innerText = `${filteredData.length} عملية مسجلة`;

    body.innerHTML = '';

    if (currentSystem === 'exchange') {
        head.innerHTML = `<tr>
                        <th onclick="sortTable(0, 'mainDataTable')">الحالة <i class="bi bi-sort-alpha-down"></i></th>
                        <th onclick="sortTable(1, 'mainDataTable')">المبلغ <i class="bi bi-sort-numeric-down"></i></th>
                        <th onclick="sortTable(2, 'mainDataTable')">سعر التصريف <i class="bi bi-sort-down"></i></th>
                        <th>التحكم</th>
                    </tr>`;
        filteredData.forEach((item, index) => {
            const row = document.createElement('tr');
            row.className = 'animate-data-row';
            row.style.animationDelay = `${index * 0.05}s`;
            row.innerHTML = `
                        <td><span class="badge ${item.type === 'بيع' ? 'bg-primary' : 'bg-danger'} rounded-pill px-3 py-2">${item.type}</span></td>
                        <td class="text-primary fs-5">$ ${formatNumber(item.amount)}</td>
                        <td>${formatNumber(item.rate, true)}</td>

                        <td class="action-cell">
                            <div class="dropup">
                                <button
                                    class="btn action-info-btn"
                                    type="button"
                                    data-bs-toggle="dropdown"
                                    data-bs-auto-close="outside"
                                    aria-expanded="false"
                                    title="خيارات السجل"
                                >
                                    <i class="bi bi-three-dots-vertical"></i>
                                </button>

                                <div class="dropdown-menu action-menu shadow-lg border-0 rounded-4 p-2">
                                    <button
                                        type="button"
                                        class="btn btn-edit-action"
                                        onclick="editItem('${item.id}')"
                                        title="تعديل"
                                    >
                                        <i class="bi bi-pencil-fill"></i>
                                    </button>

                                    <button
                                        type="button"
                                        class="btn btn-delete-action"
                                        onclick="confirmDelete('${item.id}')"
                                        title="حذف"
                                    >
                                        <i class="bi bi-trash-fill"></i>
                                    </button>
                                </div>
                            </div>
                        </td>
                    `;
            body.appendChild(row);
        });
    } else {
        head.innerHTML = `<tr>
                                <th onclick="sortTable(0, 'mainDataTable')">البيان <i class="bi bi-sort-alpha-down"></i></th>
                                <th onclick="sortTable(1, 'mainDataTable')">الحساب <i class="bi bi-sort-down"></i></th>
                                <th onclick="sortTable(2, 'mainDataTable')">الإجمالي <i class="bi bi-sort-numeric-down"></i></th>
                                <th>التحكم</th>
                            </tr>`;

        // ============================================
        // عرض الجدول التفصيلي للحركات المالية
        // المبلغ في الأعلى
        // العمولة في الأسفل
        // ============================================

        filteredData.forEach((item, index) => {
            const row = document.createElement('tr');
            row.className = 'animate-data-row';
            row.style.animationDelay = `${index * 0.05}s`;

            row.innerHTML = `
                            <td>
                                <span class="badge ${item.type === 'قبض'
                    ? 'bg-danger'
                    : 'bg-warning text-dark'} rounded-pill px-3 py-2">
                                    ${item.type}
                                </span>
                            </td>

                            <td>
                                <span class="text-dark bg-light px-2 py-1 rounded-pill">
                                    ${item.account || '-'}
                                </span>
                            </td>

                            <td class="text-primary fs-5">
                                <div class="fw-bold">
                                    ${formatNumber(item.amount)} د.ع
                                </div>

                                ${parseNumber(item.commission) > 0 ? `
                                    <small class="text-success fw-bold d-block mt-1">
                                        عمولة: ${formatNumber(item.commission)} د.ع
                                    </small>
                                ` : ''}
                            </td>

                            <td class="action-cell">
                                <div class="dropup">
                                    <button
                                        class="btn action-info-btn"
                                        type="button"
                                        data-bs-toggle="dropdown"
                                        data-bs-auto-close="outside"
                                        aria-expanded="false"
                                        title="خيارات السجل"
                                    >
                                        <i class="bi bi-three-dots-vertical"></i>
                                    </button>

                                    <div class="dropdown-menu action-menu shadow-lg border-0 rounded-4 p-2">
                                        <button
                                            type="button"
                                            class="btn btn-edit-action"
                                            onclick="editItem('${item.id}')"
                                            title="تعديل"
                                        >
                                            <i class="bi bi-pencil-fill"></i>
                                        </button>

                                        <button
                                            type="button"
                                            class="btn btn-delete-action"
                                            onclick="confirmDelete('${item.id}')"
                                            title="حذف"
                                        >
                                            <i class="bi bi-trash-fill"></i>
                                        </button>
                                    </div>
                                </div>
                            </td>
                        `;

            body.appendChild(row);
        });
    }
}

window.editItem = (id) => {
    const item = currentData.find(d => d.id === id);
    document.getElementById('editDocId').value = item.id;
    document.getElementById('amount').value = formatNumber(item.amount);

    // التحقق من النوع لضبط زر الراديو الصحيح
    if (item.type === 'بيع' || item.type === 'صرف') {
        document.getElementById('type1').checked = true;
    } else {
        document.getElementById('type2').checked = true;
    }

    if (currentSystem === 'exchange') {
        document.getElementById('rate').value = formatNumber(item.rate, true);
    } else {
        $('#accountName').val(item.account).trigger('change');

        document.getElementById('commissionSlider').value =
            item.commission || 0;

        document.getElementById('commissionValue').textContent =
            `${formatNumber(item.commission || 0)} د.ع`;

        updateCommissionSlider();
    }

    updateAmountPreview();

    document.getElementById('btnSave').innerHTML = '<i class="bi bi-pencil-fill me-2"></i> تحديث السجل الآن';
    document.getElementById('btnSave').className = 'btn btn-modern btn-info w-100 fs-5 text-white shadow-sm';
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// 4. إضافة وظيفة ترتيب الجداول
window.sortTable = (n, tableId) => {
    const table = document.getElementById(tableId);
    if (!table) return; // حماية في حال عدم وجود الجدول

    let rows, switching, i, x, y, shouldSwitch, dir, switchcount = 0;
    switching = true;
    dir = "asc";

    while (switching) {
        switching = false;
        rows = table.rows;
        // نبدأ من i=1 لتخطي رأس الجدول
        for (i = 1; i < (rows.length - 1); i++) {
            shouldSwitch = false;
            x = rows[i].getElementsByTagName("TD")[n];
            y = rows[i + 1].getElementsByTagName("TD")[n];

            if (!x || !y) continue;

            // تنظيف البيانات (إزالة الفواصل، العملة، والمسافات) للترتيب الرقمي الصحيح
            let xVal = x.innerText.replace(/[$,\s]/g, '');
            let yVal = y.innerText.replace(/[$,\s]/g, '');

            // التحقق إذا كانت القيمة رقماً
            let xNum = parseFloat(xVal);
            let yNum = parseFloat(yVal);

            if (dir == "asc") {
                if (!isNaN(xNum) && !isNaN(yNum)) {
                    if (xNum > yNum) { shouldSwitch = true; break; }
                } else {
                    if (x.innerText.toLowerCase() > y.innerText.toLowerCase()) { shouldSwitch = true; break; }
                }
            } else if (dir == "desc") {
                if (!isNaN(xNum) && !isNaN(yNum)) {
                    if (xNum < yNum) { shouldSwitch = true; break; }
                } else {
                    if (x.innerText.toLowerCase() < y.innerText.toLowerCase()) { shouldSwitch = true; break; }
                }
            }
        }
        if (shouldSwitch) {
            rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
            switching = true;
            switchcount++;
        } else {
            if (switchcount == 0 && dir == "asc") {
                dir = "desc";
                switching = true;
            }
        }
    }
};

let targetId = null;
window.confirmDelete = (id) => {
    targetId = id;
    document.getElementById('modalTitle').innerText = "تأكيد حذف العنصر";
    document.getElementById('modalText').innerText = "هل أنت متأكد من رغبتك في حذف هذا السجل بشكل نهائي؟";
    document.getElementById('confirmActionBtn').className = "btn btn-danger btn-modern px-5";
    document.getElementById('confirmActionBtn').onclick = async () => {
        try {
            await deleteDoc(doc(db, currentSystem === 'exchange' ? 'exchange_movements' : 'cash_movements', targetId));
            confirmModal.hide();
            playSuccessSound();
            showToast('تم مسح العملية المطلوبة بنجاح 🗑️', 'warning');
        } catch (e) {
            playFailureSound();
            showToast('فشل حذف المستند ❌', 'danger');
        }
    };
    confirmModal.show();
};

document.getElementById('btnDeleteRegister').onclick = () => {
    document.getElementById('modalTitle').innerText = "تنبيه أمان صارم!";
    const systemName = currentSystem === 'exchange' ? 'نظام التصريف' : 'نظام الحركات المالية';
    document.getElementById('modalText').innerText = `أنت على وشك مسح السجل الكامل لجميع البيانات في (${systemName}) نهائياً. هل أنت متأكد؟`;
    document.getElementById('confirmActionBtn').className = "btn btn-danger btn-modern px-5 fw-bold animate__animated animate__shakeY";

    document.getElementById('confirmActionBtn').onclick = async () => {
        confirmModal.hide();
        const loader = document.getElementById('loader');
        loader.style.display = 'flex';
        loader.style.opacity = '1';

        try {
            const colName = currentSystem === 'exchange' ? 'exchange_movements' : 'cash_movements';
            const colRef = collection(db, colName);
            const qSnapshot = await getDocs(colRef);

            const deletePromises = qSnapshot.docs.map(docSnapshot => deleteDoc(docSnapshot.ref));
            await Promise.all(deletePromises);

            playSuccessSound();
            showToast(`تم تصفير ومسح سجلات ${systemName} بنجاح 🛡️`, 'danger');
        } catch (error) {
            playFailureSound();
            showToast('حدث خطأ أثناء الحفظ ❌', 'danger');
        } finally {
            isSaving = false;
            btnSave.disabled = false;
        }
    };
    confirmModal.show();
};

function showToast(msg, type = 'success') {
    const id = Date.now();
    const icon = type === 'success' ? 'check-circle-fill' : type === 'warning' ? 'trash-fill' : type === 'info' ? 'palette-fill' : 'exclamation-triangle-fill';

    // ستايل إضافي للهواتف
    const mobileStyle = window.innerWidth < 768 ? 'font-size: 0.85rem; min-width: 200px; padding: 8px;' : 'min-width: 280px;';

    const html = `
                <div id="toast-${id}" class="toast show animate__animated animate__fadeInDown bg-${type} text-white border-0 shadow-lg rounded-3 mb-2" role="alert" style="${mobileStyle}">
                    <div class="d-flex p-2 align-items-center">
                        <i class="bi bi-${icon} ${window.innerWidth < 768 ? 'fs-6' : 'fs-5'} me-2"></i>
                        <div class="toast-body fw-bold p-1">${msg}</div>
                        <button type="button" class="btn-close btn-close-white ms-auto" data-bs-dismiss="toast" style="transform: scale(0.7);"></button>
                    </div>
                </div>`;
    document.getElementById('toastContainer').insertAdjacentHTML('beforeend', html);
    setTimeout(() => document.getElementById(`toast-${id}`)?.remove(), 4000);
}

function playSuccessSound() {
    const audio = new Audio('success.mp3');
    audio.play().catch(() => { });
}

function playFailureSound() {
    const audio = new Audio('failure.mp3');
    audio.play().catch(() => { });
}

function updateLastActionAndStats() {
    const container = document.getElementById('lastActionAndStats');

    if (currentData.length === 0) {
        container.innerHTML = '';
        return;
    }

    const last = currentData[0];

    let totalUp = 0;
    let totalDown = 0;

    if (currentSystem === 'exchange') {
        currentData.forEach(item => {
            const amt = parseNumber(item.amount);

            if (item.type === 'بيع') {
                totalUp += amt;
            } else if (item.type === 'شراء') {
                totalDown += amt;
            }
        });
    } else {
        currentData.forEach(item => {
            const amount = parseNumber(item.amount);
            const commission = parseNumber(item.commission);

            const net = item.type === 'قبض'
                ? amount + commission
                : amount - commission;

            if (item.type === 'قبض') {
                totalUp += net;
            } else if (item.type === 'صرف') {
                totalDown += net;
            }
        });
    }

    const upTitle = currentSystem === 'exchange'
        ? 'البيع الكلي'
        : 'القبض الكلي';

    const downTitle = currentSystem === 'exchange'
        ? 'الشراء الكلي'
        : 'الصرف الكلي';

    container.innerHTML = `
        <div class="alert bg-white border-0 shadow-sm rounded-4 d-flex justify-content-between align-items-center p-3 border-start border-primary border-5 mb-3">
            <div>
                <span class="text-secondary small d-block mb-1">الحركة الأخيرة المسجلة:</span>
                <span class="fw-bold fs-5 text-dark">
                    ${last.type} - ${formatNumber(last.amount)}
                    ${last.rate ? ' (سعر: ' + formatNumber(last.rate) + ')' : ''}
                </span>
            </div>
            <i class="bi bi-clock-history fs-2 text-primary opacity-25"></i>
        </div>

        <div class="row g-3 mb-4">
            <div class="col-6">
                <div class="stat-card-box stat-card-up d-flex align-items-center justify-content-between shadow-sm">
                    <div>
                        <small class="text-muted fw-bold d-block mb-1">${upTitle}</small>
                        <h4 class="m-0 fw-800 text-primary">
                            ${formatNumber(totalUp)}
                            ${currentSystem === 'exchange' ? '$' : ' د.ع'}
                        </h4>
                    </div>
                </div>
            </div>

            <div class="col-6">
                <div class="stat-card-box stat-card-down d-flex align-items-center justify-content-between shadow-sm">
                    <div>
                        <small class="text-muted fw-bold d-block mb-1">${downTitle}</small>
                        <h4 class="m-0 fw-800 text-danger">
                            ${formatNumber(totalDown)}
                            ${currentSystem === 'exchange' ? '$' : ' د.ع'}
                        </h4>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderReports() {
    const head = document.getElementById('reportHeader');
    const body = document.getElementById('reportTableBody');

    // إذا عناصر التقرير غير موجودة لا تكمل
    if (!head || !body) {
        console.warn('Report table elements not found.');
        return;
    }

    // إذا لا توجد بيانات
    if (!currentData || currentData.length === 0) {
        head.innerHTML = '';
        body.innerHTML = `
            <tr>
                <td colspan="10" class="text-center text-muted py-4">
                    لا توجد بيانات لعرضها حالياً
                </td>
            </tr>
        `;
        return;
    }

    if (currentSystem === 'exchange') {
        renderWeightedAverage(currentData);
        head.innerHTML = `
            <tr>
                <th onclick="sortTable(0, 'reportTable')">
                    نوع الحركة <i class="bi bi-sort-alpha-down"></i>
                </th>
                <th onclick="sortTable(1, 'reportTable')">
                    سعر التصريف <i class="bi bi-sort-numeric-down"></i>
                </th>
                <th onclick="sortTable(2, 'reportTable')">
                    الإجمالي <i class="bi bi-sort-down"></i>
                </th>
            </tr>
        `;

        // تجميع حسب نوع الحركة + سعر التصريف
        const groups = currentData.reduce((acc, item) => {
            const key = `${item.type}-${item.rate || 0}`;

            if (!acc[key]) {
                acc[key] = {
                    type: item.type,
                    rate: item.rate || 0,
                    total: 0
                };
            }

            acc[key].total += parseNumber(item.amount);

            return acc;
        }, {});

        body.innerHTML = Object.values(groups)
            .sort((a, b) => {
                // ترتيب حسب النوع ثم السعر
                if (a.type !== b.type) {
                    return a.type.localeCompare(b.type, 'ar');
                }
                return parseNumber(a.rate) - parseNumber(b.rate);
            })
            .map(g => `
                <tr class="animate-data-row">
                    <td>
                        <span class="badge ${g.type === 'بيع'
                    ? 'bg-primary'
                    : 'bg-danger'
                } px-3 py-1 rounded-pill">
                            ${g.type}
                        </span>
                    </td>

                    <td class="fw-bold text-dark">
                        ${formatNumber(g.rate, true)}
                    </td>

                    <td class="text-primary fw-bold">
                        $ ${formatNumber(g.total)}
                    </td>
                </tr>
            `)
            .join('');

    } else {
        document.getElementById('weightedAverageCards').innerHTML = '';
        head.innerHTML = `
            <tr>
                <th onclick="sortTable(0, 'reportTable')">
                    الحساب <i class="bi bi-sort-alpha-down"></i>
                </th>
                <th onclick="sortTable(1, 'reportTable')">
                    النوع <i class="bi bi-sort-down"></i>
                </th>
                <th onclick="sortTable(2, 'reportTable')">
                    الإجمالي <i class="bi bi-sort-numeric-down"></i>
                </th>
            </tr>
        `;

        const groups = currentData.reduce((acc, item) => {
            const key = `${item.account}-${item.type}`;

            if (!acc[key]) {
                acc[key] = {
                    acc: item.account,
                    type: item.type,
                    total: 0
                };
            }

            const amount = parseNumber(item.amount);
            const commission = parseNumber(item.commission);

            const net = item.type === 'قبض'
                ? amount + commission
                : amount - commission;

            acc[key].total += net;

            return acc;
        }, {});

        body.innerHTML = Object.values(groups).map(g => `
            <tr class="animate-data-row">
                <td>
                    <span class="text-dark bg-light px-2.5 py-1 rounded-pill">
                        ${g.acc}
                    </span>
                </td>

                <td>
                    <span class="badge ${g.type === 'قبض'
                ? 'bg-danger'
                : 'bg-warning text-dark'
            } px-3 py-1 rounded-pill">
                        ${g.type}
                    </span>
                </td>

                <td class="text-success fw-bold">
                    ${formatNumber(g.total)} د.ع
                </td>
            </tr>
        `).join('');
    }
}

const savedTheme = localStorage.getItem('labwa-theme') || 'light';
document.body.setAttribute('data-theme', savedTheme);
initDataListener();



// أضف هذا الكود داخل الـ Script
document.querySelector('.d-flex.align-items-center.bg-white.p-2').style.cursor = 'pointer';
document.querySelector('.d-flex.align-items-center.bg-white.p-2').onclick = () => {
    showToast("جاري تحديث البيانات...", "info");
    location.reload();
};


// إضافة ميزة السحب للتحديث
let touchStart = 0;
window.addEventListener('touchstart', (e) => {
    touchStart = e.touches[0].pageY;
}, { passive: true });

window.addEventListener('touchmove', (e) => {
    const touchEnd = e.touches[0].pageY;
    if (window.scrollY === 0 && touchEnd - touchStart > 150) {
        // إذا سحب المستخدم أكثر من 150 بكسل لأسفل وهو في قمة الصفحة
        location.reload();
    }
}, { passive: true });



window.shareReport = async function () {
    const reportTable = document.querySelector('#reportsSection .table-responsive');

    if (!reportTable) {
        showToast('لم يتم العثور على جدول التقرير', 'danger');
        return;
    }

    try {
        showToast('جاري تجهيز صورة التقرير...', 'info');

        const canvas = await html2canvas(reportTable, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff'
        });

        canvas.toBlob(async (blob) => {
            if (!blob) {
                showToast('فشل إنشاء الصورة', 'danger');
                return;
            }

            const file = new File(
                [blob],
                `labwa-report-${Date.now()}.png`,
                { type: 'image/png' }
            );

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: 'تقرير سجل اللبوة',
                    files: [file]
                });
            } else {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = file.name;
                link.click();
            }

            showToast('تم تجهيز التقرير بنجاح 📊', 'success');
        });

    } catch (error) {
        console.error(error);
        showToast('تعذر مشاركة التقرير', 'danger');
    }
};





// =====================================
// Floating Action Button - Dynamic Version
// =====================================

const fabContainer = document.getElementById('fabContainer');
const fabMain = document.getElementById('fabMain');
const fabOverlay = document.getElementById('fabOverlay');
const fabReport = document.getElementById('fabReport');
const fabSwitch = document.getElementById('fabSwitch');
const fabRefresh = document.getElementById('fabRefresh');

function updateFabLabels() {
    // الزر الأول: الرئيسية ↔ التقارير
    if (currentView === 'reports') {
        fabReport.querySelector('i').className = 'bi bi-plus-circle-fill';
        fabReport.querySelector('span').textContent = 'تسجيل جديد';
    } else {
        fabReport.querySelector('i').className = 'bi bi-bar-chart-fill';
        fabReport.querySelector('span').textContent = 'التقارير';
    }

    // الزر الثاني: التصريف ↔ الحركات المالية
    if (currentSystem === 'exchange') {
        fabSwitch.querySelector('i').className = 'bi bi-wallet2';
        fabSwitch.querySelector('span').textContent = 'الحركات المالية';
    } else {
        fabSwitch.querySelector('i').className = 'bi bi-arrow-left-right';
        fabSwitch.querySelector('span').textContent = 'نظام التصريف';
    }
}

function openFab() {
    updateFabLabels();
    fabContainer?.classList.add('open');
    fabOverlay?.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeFab() {
    fabContainer?.classList.remove('open');
    fabOverlay?.classList.remove('show');
    document.body.style.overflow = '';
}

function toggleFab() {
    fabContainer?.classList.contains('open')
        ? closeFab()
        : openFab();
}

// الزر الرئيسي
fabMain?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFab();
});

// الخلفية
fabOverlay?.addEventListener('click', closeFab);

// الزر الأول: الرئيسية ↔ التقارير
fabReport?.addEventListener('click', (e) => {
    e.stopPropagation();

    if (currentView === 'reports') {
        showView('home');
    } else {
        showView('reports');
    }

    closeFab();
});

// الزر الثاني: تبديل النظام
fabSwitch?.addEventListener('click', (e) => {
    e.stopPropagation();

    const nextSystem =
        currentSystem === 'exchange'
            ? 'cash'
            : 'exchange';

    switchSystem(nextSystem);
    closeFab();
});

// زر التحديث
fabRefresh?.addEventListener('click', (e) => {
    e.stopPropagation();
    showToast('جاري تحديث البيانات...', 'info');
    location.reload();
});

// الضغط خارج القائمة
document.addEventListener('click', (e) => {
    if (fabContainer && !fabContainer.contains(e.target)) {
        closeFab();
    }
});

// ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeFab();
});

// Resize
window.addEventListener('resize', closeFab);

// تحديث أولي
updateFabLabels();


// دالة رندر صفحة المطابقة
window.renderMatchView = async () => {
    const totalCurrentBalanceEl =
        document.getElementById('totalCurrentBalance');

    if (totalCurrentBalanceEl) {
        totalCurrentBalanceEl.innerHTML =
            '<span class="spinner-border spinner-border-sm"></span>';
    }

    try {
        // ==========================================
        // 1. جلب رصيد النظام
        // ==========================================
        await fetchSystemBalance();

        // ==========================================
        // 2. جلب بيانات التصريف مباشرة من Firestore
        //    وعدم الاعتماد على currentData
        // ==========================================
        const snapshot = await getDocs(
            query(
                collection(db, 'exchange_movements'),
                orderBy('timestamp', 'desc')
            )
        );

        let totalSell = 0;
        let totalBuy = 0;

        snapshot.forEach(docSnap => {
            const item = docSnap.data();
            const amount = parseNumber(item.amount);

            // دعم أكثر من تسمية محتملة
            const type = item.type || item.operationType || '';

            if (
                type === 'بيع' ||
                type === 'sell' ||
                type === 'type2'
            ) {
                totalSell += amount;
            } else if (
                type === 'شراء' ||
                type === 'buy' ||
                type === 'type1'
            ) {
                totalBuy += amount;
            }
        });

        // ==========================================
        // 3. حساب الرصيد الفعلي المتوقع
        // ==========================================
        const currentActualBalance =
            (systemStoredBalance + totalBuy) - totalSell;

        // ==========================================
        // 4. تحديث الكروت
        // ==========================================
        document.getElementById('totalCurrentBalance').innerText =
            formatNumber(currentActualBalance);

        document.getElementById('storedSystemBalance').innerText =
            `$${formatNumber(systemStoredBalance)}`;

        document.getElementById('totalSellMatch').innerText =
            `$${formatNumber(totalSell)}`;

        document.getElementById('totalBuyMatch').innerText =
            `$${formatNumber(totalBuy)}`;

        // ==========================================
        // 5. تصفير حقل الإدخال
        // ==========================================
        const input = document.getElementById('newSystemBalance');
        if (input) {
            input.value = '0';
        }

        // ==========================================
        // 6. تحميل سجل آخر 10 حركات
        // ==========================================
        await renderBalanceLogs();

    } catch (error) {
        console.error('Render Match View Error:', error);

        document.getElementById('totalCurrentBalance').innerText = '0';
        document.getElementById('storedSystemBalance').innerText = '$0';
        document.getElementById('totalSellMatch').innerText = '$0';
        document.getElementById('totalBuyMatch').innerText = '$0';

        playFailureSound?.();
        showToast?.(
            'تعذر تحميل بيانات مطابقة الدولار',
            'danger'
        );
    }
};

// ============================================
// زيادة أو إنقاص رصيد النظام
// action = 'increase' | 'decrease'
// ============================================
window.adjustSystemBalance = async function (action) {
    const input = document.getElementById('newSystemBalance');
    const amount = parseNumber(input?.value);

    // التحقق من صحة المبلغ
    if (!amount || amount <= 0) {
        playFailureSound();
        showToast('أدخل مبلغاً صحيحاً أكبر من صفر', 'danger');
        return;
    }

    // تحديد نوع العملية
    const isIncrease = action === 'increase';
    const operationText = isIncrease ? 'قبض' : 'سحب';
    const operationIcon = isIncrease ? '➕' : '➖';

    // تجهيز المودل
    document.getElementById('modalTitle').innerText =
        `${operationIcon} تأكيد ${operationText}`;

    document.getElementById('modalText').innerText =
        `هل أنت متأكد من ${operationText} رصيد النظام بمقدار ${formatNumber(amount)} دولار؟`;

    const confirmBtn = document.getElementById('confirmActionBtn');
    confirmBtn.className =
        `btn btn-modern px-5 ${isIncrease ? 'btn-success' : 'btn-danger'}`;

    // عند الضغط على زر التأكيد
    confirmBtn.onclick = async () => {
        try {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML =
                '<span class="spinner-border spinner-border-sm me-2"></span>جاري التنفيذ...';

            // جلب الرصيد الحالي
            const docId = await fetchSystemBalance();

            // حساب الرصيد الجديد
            const newBalance = isIncrease
                ? systemStoredBalance + amount
                : systemStoredBalance - amount;

            // حفظ الرصيد
            if (docId) {
                await updateDoc(
                    doc(db, 'system_settings', docId),
                    { balance: newBalance }
                );
            } else {
                await addDoc(
                    collection(db, 'system_settings'),
                    { balance: newBalance }
                );
            }

            // تسجيل العملية
            await addBalanceLog(
                operationText,
                amount,
                newBalance
            );

            // إغلاق المودل
            confirmModal.hide();

            // صوت نجاح
            playSuccessSound();

            // رسالة نجاح
            showToast(
                `تم ${operationText} رصيد النظام بنجاح`,
                'success'
            );

            // تحديث الصفحة
            await renderMatchView();

            // تصفير الحقل
            input.value = '0';

        } catch (error) {
            console.error(error);

            confirmModal.hide();
            playFailureSound();
            showToast('حدث خطأ أثناء تنفيذ العملية', 'danger');
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = 'نعم، متأكد';
        }
    };

    // عرض المودل
    confirmModal.show();
};

// مطابقة الرصيد (تصفية)
// ملاحظة مهمة:
// عند الدخول إلى صفحة المطابقة مباشرة بعد نظام الحركات المالية,
// قد يكون currentData ما زال يحتوي بيانات cash_movements
// لأن onSnapshot لم يُحدّث البيانات بعد.
// لذلك نقوم بجلب بيانات exchange_movements مباشرة من Firestore
// لضمان الحساب الصحيح دائماً.

window.syncBalances = async function () {
    try {
        // ==========================================
        // 1) جلب أحدث بيانات التصريف مباشرة من Firestore
        // ==========================================
        const exchangeSnapshot = await getDocs(
            query(
                collection(db, 'exchange_movements'),
                orderBy('timestamp', 'desc')
            )
        );

        const exchangeData = exchangeSnapshot.docs.map(docSnap => ({
            id: docSnap.id,
            ...docSnap.data()
        }));

        // ==========================================
        // 2) حساب إجمالي البيع والشراء
        // ==========================================
        let totalSell = 0;
        let totalBuy = 0;

        exchangeData.forEach(item => {
            const amount = parseNumber(item.amount);

            if (item.type === 'بيع') {
                totalSell += amount;
            } else if (item.type === 'شراء') {
                totalBuy += amount;
            }
        });

        // ==========================================
        // 3) حساب الرصيد الجديد
        // الرصيد الجديد = رصيد النظام + الشراء - البيع
        // ==========================================
        const newBalance =
            (parseNumber(systemStoredBalance) + totalBuy) - totalSell;

        // ==========================================
        // 4) تجهيز نافذة التأكيد
        // ==========================================
        document.getElementById('modalTitle').innerText =
            '⚖️ تأكيد مطابقة الرصيد';

        document.getElementById('modalText').innerHTML = `
    <div class="text-center" style="line-height: 2;">
        
        <div class="mb-2">
            رصيد النظام الحالي:
            <strong class="text-secondary">
                $${formatNumber(systemStoredBalance)}
            </strong>
        </div>

        <div class="mb-2">
            الشراء:
            <strong class="text-success">
                + $${formatNumber(totalBuy)}
            </strong>
            &nbsp;|&nbsp;
            البيع:
            <strong class="text-danger">
                - $${formatNumber(totalSell)}
            </strong>
        </div>

        <div class="mt-3 pt-2 border-top">
            الرصيد الجديد:
            <strong class="text-primary fs-5 d-block mt-1">
                $${formatNumber(newBalance)}
            </strong>
        </div>

        <div class="mt-3 small text-danger fw-bold">
            سيتم حذف جميع سجلات التصريف والبدء من جديد.
        </div>

    </div>
`;

        const confirmBtn =
            document.getElementById('confirmActionBtn');

        confirmBtn.className =
            'btn btn-warning btn-modern px-5 fw-bold text-dark';

        confirmBtn.innerHTML =
            'نعم، نفذ المطابقة';

        // ==========================================
        // 5) عند تأكيد العملية
        // ==========================================
        confirmBtn.onclick = async () => {
            try {
                confirmBtn.disabled = true;
                confirmBtn.innerHTML = `
                    <span class="spinner-border spinner-border-sm me-2"></span>
                    جاري التنفيذ...
                `;

                // جلب مستند إعدادات النظام
                const docId = await fetchSystemBalance();

                // تحديث أو إنشاء الرصيد الجديد
                if (docId) {
                    await updateDoc(
                        doc(db, 'system_settings', docId),
                        {
                            balance: newBalance,
                            updatedAt: new Date()
                        }
                    );
                } else {
                    await addDoc(
                        collection(db, 'system_settings'),
                        {
                            balance: newBalance,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        }
                    );
                }

                // تسجيل سجل المطابقة
                await addBalanceLog(
                    'مطابقة',
                    newBalance,
                    newBalance
                );

                // حذف جميع سجلات التصريف
                await Promise.all(
                    exchangeSnapshot.docs.map(docSnap =>
                        deleteDoc(docSnap.ref)
                    )
                );

                // تحديث الرصيد المحلي
                systemStoredBalance = newBalance;

                // تحديث currentData محلياً
                currentData = [];

                // إغلاق المودل
                confirmModal.hide();

                // إشعارات
                playSuccessSound();
                showToast(
                    'تمت المطابقة ومسح سجل التصريف بنجاح ✅',
                    'success'
                );

                // إعادة تحميل بيانات التصريف
                if (currentSystem !== 'exchange') {
                    currentSystem = 'exchange';
                }

                // تحديث العرض
                await renderMatchView();

            } catch (error) {
                console.error('Sync Balance Error:', error);

                confirmModal.hide();
                playFailureSound();
                showToast(
                    'فشل تنفيذ عملية المطابقة ❌',
                    'danger'
                );
            } finally {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = 'نعم، نفذ المطابقة';
            }
        };

        // ==========================================
        // 6) عرض نافذة التأكيد
        // ==========================================
        confirmModal.show();

    } catch (error) {
        console.error('Load Exchange Data Error:', error);
        playFailureSound();
        showToast(
            'تعذر تحميل بيانات التصريف للمطابقة ❌',
            'danger'
        );
    }
};

async function fetchSystemBalance() {
    const q = query(collection(db, SYSTEM_SETTINGS_COLLECTION));
    const snap = await getDocs(q);

    if (!snap.empty) {
        const docData = snap.docs[0].data();
        systemStoredBalance = parseNumber(docData.balance || 0);
        return snap.docs[0].id;
    }

    systemStoredBalance = 0;
    return null;
}

// ============================================
async function addBalanceLog(type, amount, balanceAfter) {
    await addDoc(collection(db, SYSTEM_BALANCE_LOGS_COLLECTION), {
        type,
        amount,
        balanceAfter,
        timestamp: new Date()
    });

    // الاحتفاظ بآخر 10 سجلات فقط
    const logsQuery = query(
        collection(db, SYSTEM_BALANCE_LOGS_COLLECTION),
        orderBy('timestamp', 'desc')
    );

    const snapshot = await getDocs(logsQuery);

    if (snapshot.docs.length > MAX_BALANCE_LOGS) {
        const docsToDelete = snapshot.docs.slice(MAX_BALANCE_LOGS);

        await Promise.all(
            docsToDelete.map(docSnap => deleteDoc(docSnap.ref))
        );
    }
}

async function renderBalanceLogs() {
    const tbody = document.getElementById('balanceLogsBody');
    const countBadge = document.getElementById('balanceLogCount');

    if (!tbody || !countBadge) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="4" class="py-4">
                <div class="spinner-border spinner-border-sm text-primary"></div>
            </td>
        </tr>
    `;

    try {
        const q = query(
            collection(db, SYSTEM_BALANCE_LOGS_COLLECTION),
            orderBy('timestamp', 'desc')
        );

        const snapshot = await getDocs(q);

        countBadge.textContent = `${snapshot.docs.length} حركة`;

        if (snapshot.empty) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-muted py-4">
                        لا توجد حركات مسجلة حالياً
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = snapshot.docs.map(docSnap => {
            const item = docSnap.data();

            let badgeClass = 'bg-secondary';

            if (item.type === 'قبض') badgeClass = 'bg-success';
            if (item.type === 'سحب') badgeClass = 'bg-danger';
            if (item.type === 'تحديث يدوي') badgeClass = 'bg-info';
            if (item.type === 'مطابقة') badgeClass = 'bg-warning text-dark';

            return `
                <tr class="animate-data-row">
                    <td>
                        <span class="badge ${badgeClass} px-3 py-2 rounded-pill">
                            ${item.type}
                        </span>
                    </td>

                    <td class="fw-bold text-primary">
                        $${formatNumber(item.amount)}
                    </td>

                    <td class="fw-bold text-dark">
                        $${formatNumber(item.balanceAfter)}
                    </td>

                    <td class="small text-muted">
                        <div class="d-flex flex-column align-items-center lh-sm">
                            <span class="fw-bold">
                                ${(() => {
                    try {
                        const date = item.timestamp?.toDate
                            ? item.timestamp.toDate()
                            : new Date(item.timestamp);

                        return date.toLocaleDateString('ar-IQ');
                    } catch {
                        return '-';
                    }
                })()}
                            </span>

                            <span class="text-secondary mt-1" style="font-size: 0.75rem;">
                                ${(() => {
                    try {
                        const date = item.timestamp?.toDate
                            ? item.timestamp.toDate()
                            : new Date(item.timestamp);

                        return date.toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
                        });
                    } catch {
                        return '';
                    }
                })()}
                            </span>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-danger py-4">
                    تعذر تحميل السجل
                </td>
            </tr>
        `;
    }
}


// ==========================================
// إعداد إشعارات الهاتف (Firebase Cloud Messaging)
// ==========================================
async function initPushNotifications(retryCount = 0) {
    const MAX_RETRIES = 5;

    try {
        // ننتظر حتى يكتمل تحميل الصفحة بالكامل
        if (document.readyState !== "complete") {
            window.addEventListener("load", () => {
                initPushNotifications();
            }, { once: true });
            return;
        }

        // تأخير بسيط حتى يختفي اللودر
        await new Promise(resolve => setTimeout(resolve, 2000));

        // التحقق من دعم الإشعارات
        if (!("Notification" in window)) {
            console.log("المتصفح لا يدعم الإشعارات");
            return;
        }

        // إذا المستخدم رفض الإشعارات سابقًا
        if (Notification.permission === "denied") {
            console.log("الإشعارات مرفوضة من المستخدم");
            return;
        }

        // طلب الإذن إذا لم يكن مسموحًا بعد
        let permission = Notification.permission;

        if (permission !== "granted") {
            permission = await Notification.requestPermission();
        }

        // إذا لم يمنح المستخدم الإذن
        if (permission !== "granted") {
            console.log("لم يتم منح إذن الإشعارات");

            // إعادة المحاولة بعد 10 ثوانٍ إذا لم نتجاوز الحد الأقصى
            if (retryCount < MAX_RETRIES) {
                setTimeout(() => {
                    initPushNotifications(retryCount + 1);
                }, 10000);
            }

            return;
        }

        // تسجيل Service Worker
        const registration = await navigator.serviceWorker.register(
            "./firebase-messaging-sw.js"
        );

        console.log("Service Worker registered");

        // الحصول على FCM Token
        const token = await getToken(messaging, {
            vapidKey:
                "BKZU-SPel46zSPtxfTRVx2qEwQ0Ngfb96HPaz8vGOEUC59kGx8rQcv8pZgmPRMvXV0jFHG6V5L-BTrSDa75QBf8",
            serviceWorkerRegistration: registration
        });

        // إذا لم يتم الحصول على التوكن
        if (!token) {
            console.log("لم يتم الحصول على FCM Token");

            if (retryCount < MAX_RETRIES) {
                setTimeout(() => {
                    initPushNotifications(retryCount + 1);
                }, 5000);
            }

            return;
        }

        console.log("FCM Token:", token);

        // حفظ التوكن في Firestore
        await setDoc(
            doc(db, "fcm_tokens", token),
            {
                token: token,
                createdAt: new Date(),
                userAgent: navigator.userAgent,
                updatedAt: new Date()
            }
        );

        console.log("تم حفظ FCM Token بنجاح");

        // إشعار نجاح اختياري
        // showToast("تم تفعيل الإشعارات بنجاح 🔔", "success");

    } catch (error) {
        console.error("خطأ في إعداد الإشعارات:", error);

        // إعادة المحاولة تلقائيًا عند الخطأ
        if (retryCount < MAX_RETRIES) {
            console.log(`إعادة المحاولة رقم ${retryCount + 1}`);

            setTimeout(() => {
                initPushNotifications(retryCount + 1);
            }, 5000);
        }
    }
}

function showBrowserNotification(data, system) {
    // لا ترسل إشعار إذا لم يمنح المستخدم الإذن
    if (Notification.permission !== "granted") return;

    let title = "";
    let body = "";

    if (system === "exchange") {
        title = "💱 حركة تصريف جديدة";
        body = `${data.type} - $${formatNumber(data.amount)}`;
    } else {
        title = "💰 حركة مالية جديدة";
        body = `${data.type} - ${formatNumber(data.amount)} د.ع`;
    }

    new Notification(title, {
        body: body,
        icon: "/icon.png",
        badge: "/icon.png"
    });
}