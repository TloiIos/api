// Cấu hình các đường dẫn Firebase Realtime Database của bạn
const FIREBASE_URLS = {
    keys: "https://keyb-2f31d-default-rtdb.asia-southeast1.firebasedatabase.app/keys.json",
    packages: "https://keyb-2f31d-default-rtdb.asia-southeast1.firebasedatabase.app/packages.json",
    bypass: "https://keyb-2f31d-default-rtdb.asia-southeast1.firebasedatabase.app/bypass_menu_uids.json",
    devices: "https://keyb-2f31d-default-rtdb.asia-southeast1.firebasedatabase.app/device_info.json"
};

// Chuyển đổi qua lại giữa các Tab
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function() {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        
        this.classList.add('active');
        const tabId = this.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
        
        loadDataForActiveTab(tabId);
    });
});

function loadDataForActiveTab(tabId) {
    if (tabId === 'packages-tab') fetchPackages();
    if (tabId === 'keys-tab') fetchKeys();
    if (tabId === 'bypass-tab') fetchBypass();
    if (tabId === 'devices-tab') fetchDevices();
}

// Khởi chạy load dữ liệu ban đầu
window.onload = () => {
    fetchPackages();
};

// --- QUẢN LÝ PACKAGES ---
async function fetchPackages() {
    try {
        let res = await fetch(FIREBASE_URLS.packages);
        let data = await res.json();
        let tbody = document.getElementById('packageTableBody');
        tbody.innerHTML = '';
        
        if (!data) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Chưa có package nào được tạo.</td></tr>`;
            return;
        }

        // Sắp xếp theo thời gian tạo mới nhất lên đầu
        let sortedIds = Object.keys(data).sort((a, b) => {
            let ta = data[a].createdAt || 0;
            let tb = data[b].createdAt || 0;
            return tb - ta;
        });

        sortedIds.forEach(id => {
            let pkg = data[id];
            let isLocked = pkg.status === 'locked' || pkg.status === 'disabled';
            tbody.innerHTML += `
                <tr class="${isLocked ? 'row-locked' : ''}">
                    <td><strong>${pkg.name}</strong></td>
                    <td>${pkg.durationDays === 0 ? 'Vĩnh viễn' : pkg.durationDays + ' ngày'}</td>
                    <td>${pkg.maxDevices} Thiết bị</td>
                    <td>${pkg.price} VNĐ</td>
                    <td>
                        <span class="badge ${isLocked ? 'badge-danger' : 'badge-success'}">
                            ${isLocked ? 'Đã khóa' : 'Hoạt động'}
                        </span>
                    </td>
                    <td>
                        <button class="btn ${isLocked ? 'btn-success' : 'btn-warning'} btn-sm" onclick="togglePackageStatus('${id}', '${pkg.status}')">
                            <i class="fa-solid ${isLocked ? 'fa-unlock' : 'fa-lock'}"></i> ${isLocked ? 'Mở khóa' : 'Khóa'}
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="deleteItem('packages', '${id}')"><i class="fa-solid fa-trash"></i> Xóa</button>
                    </td>
                </tr>
            `;
        });
    } catch (e) {
        console.error(e);
    }
}

async function createPackage(e) {
    e.preventDefault();
    let name = document.getElementById('pkgName').value;
    let durationDays = parseInt(document.getElementById('pkgDuration').value);
    let maxDevices = parseInt(document.getElementById('pkgMaxDevices').value);
    let price = parseFloat(document.getElementById('pkgPrice').value);

    let newPkg = {
        name,
        durationDays,
        maxDevices,
        price,
        status: "active",
        createdAt: Date.now()
    };

    let res = await fetch(FIREBASE_URLS.packages, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPkg)
    });

    if (res.ok) {
        closeModal('packageModal');
        fetchPackages();
        document.getElementById('packageForm').reset();
    }
}

// Khóa / Mở khóa Package
async function togglePackageStatus(id, currentStatus) {
    let isLocked = currentStatus === 'locked' || currentStatus === 'disabled';
    let newStatus = isLocked ? 'active' : 'locked';
    let action = isLocked ? 'mở khóa' : 'khóa';

    if (!confirm(`Bạn có chắc chắn muốn ${action} package này?`)) return;

    let res = await fetch(`https://keyb-2f31d-default-rtdb.asia-southeast1.firebasedatabase.app/packages/${id}.json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
    });

    if (res.ok) {
        fetchPackages();
    } else {
        alert("Cập nhật trạng thái thất bại!");
    }
}

// --- QUẢN LÝ KEYS (Logic: Bắt buộc chọn Package đã tạo) ---
async function openKeyModal() {
    let res = await fetch(FIREBASE_URLS.packages);
    let data = await res.json();
    let select = document.getElementById('keyPackageSelect');
    select.innerHTML = '';

    if (!data) {
        alert("Bạn cần tạo Package trước khi tạo Key!");
        return;
    }

    Object.keys(data).forEach(id => {
        let pkg = data[id];
        select.innerHTML += `<option value="${id}" data-duration="${pkg.durationDays}" data-max="${pkg.maxDevices}">${pkg.name} (Max: ${pkg.maxDevices} máy, ${pkg.durationDays} ngày)</option>`;
    });

    // Tự điền giá trị mặc định từ package đầu tiên
    syncKeyDefaults();
    openModal('keyModal');
}

// Đồng bộ Duration & Max Devices theo package đang chọn
function syncKeyDefaults() {
    let select = document.getElementById('keyPackageSelect');
    let selectedOption = select.options[select.selectedIndex];
    if (!selectedOption) return;

    let duration = parseInt(selectedOption.getAttribute('data-duration'));
    let maxDevices = parseInt(selectedOption.getAttribute('data-max'));

    document.getElementById('keyDurationInput').value = duration;
    document.getElementById('keyMaxDevicesInput').value = maxDevices;
}

async function fetchKeys() {
    try {
        let res = await fetch(FIREBASE_URLS.keys);
        let data = await res.json();
        let tbody = document.getElementById('keyTableBody');
        tbody.innerHTML = '';

        if (!data) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Chưa có key nào.</td></tr>`;
            return;
        }

        // Sắp xếp theo thời gian tạo mới nhất lên đầu
        let sortedIds = Object.keys(data).sort((a, b) => {
            let ta = data[a].createdAt || 0;
            let tb = data[b].createdAt || 0;
            return tb - ta;
        });

        sortedIds.forEach(keyId => {
            let k = data[keyId];
            let deviceCount = k.devices ? Object.keys(k.devices).length : 0;
            let createdDate = new Date(k.createdAt).toLocaleString();
            let expiresDate = k.expiresAt === 0 ? 'Vĩnh viễn' : new Date(k.expiresAt).toLocaleString();
            let isLocked = k.status === 'locked' || k.status === 'disabled';

            tbody.innerHTML += `
                <tr class="${isLocked ? 'row-locked' : ''}">
                    <td><code>${k.key}</code></td>
                    <td><small>${k.packageId}</small></td>
                    <td>${deviceCount} / ${k.maxDevices} máy</td>
                    <td><small>Tạo: ${createdDate}<br>Hết: ${expiresDate}</small></td>
                    <td>
                        <span class="badge ${isLocked ? 'badge-danger' : 'badge-success'}">
                            ${isLocked ? 'Đã khóa' : 'Hoạt động'}
                        </span>
                    </td>
                    <td>
                        <button class="btn ${isLocked ? 'btn-success' : 'btn-warning'} btn-sm" onclick="toggleKeyStatus('${k.key}', '${k.status}')">
                            <i class="fa-solid ${isLocked ? 'fa-unlock' : 'fa-lock'}"></i> ${isLocked ? 'Mở khóa' : 'Khóa'}
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="deleteKeyFromFirebase('${k.key}')"><i class="fa-solid fa-trash"></i> Xóa</button>
                    </td>
                </tr>
            `;
        });
    } catch (e) {
        console.error(e);
    }
}

async function createKey(e) {
    e.preventDefault();
    let select = document.getElementById('keyPackageSelect');
    let packageId = select.value;

    // Lấy giá trị tùy chỉnh từ form (cho phép chỉnh thời hạn & số thiết bị)
    let durationDays = parseInt(document.getElementById('keyDurationInput').value);
    let maxDevices = parseInt(document.getElementById('keyMaxDevicesInput').value);

    if (isNaN(durationDays) || durationDays < 0) durationDays = 0;
    if (isNaN(maxDevices) || maxDevices < 1) maxDevices = 1;

    let customKey = document.getElementById('customKeyInput').value.trim();
    let keyString = customKey !== "" ? customKey : 'KEY-' + Math.random().toString(36).substring(2, 8).toUpperCase() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();

    let createdAt = Date.now();
    let expiresAt = durationDays === 0 ? 0 : createdAt + (durationDays * 24 * 60 * 60 * 1000);

    let keyData = {
        key: keyString,
        packageId: packageId,
        maxDevices: maxDevices,
        createdAt: createdAt,
        expiresAt: expiresAt,
        status: "active",
        devices: {} // Khởi tạo danh sách thiết bị trống chứa UID theo yêu cầu
    };

    // Push key lên firebase theo định dạng key string làm ID node
    let updateObj = {};
    updateObj[keyString] = keyData;

    let res = await fetch(`https://keyb-2f31d-default-rtdb.asia-southeast1.firebasedatabase.app/keys.json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateObj)
    });

    if (res.ok) {
        closeModal('keyModal');
        fetchKeys();
        document.getElementById('keyForm').reset();
    }
}

async function deleteKeyFromFirebase(keyStr) {
    if(confirm("Bạn có chắc chắn muốn xóa key này?")) {
        await fetch(`https://keyb-2f31d-default-rtdb.asia-southeast1.firebasedatabase.app/keys/${keyStr}.json`, {
            method: 'DELETE'
        });
        fetchKeys();
    }
}

// Khóa / Mở khóa Key
async function toggleKeyStatus(keyStr, currentStatus) {
    let isLocked = currentStatus === 'locked' || currentStatus === 'disabled';
    let newStatus = isLocked ? 'active' : 'locked';
    let action = isLocked ? 'mở khóa' : 'khóa';

    if (!confirm(`Bạn có chắc chắn muốn ${action} key này?`)) return;

    let res = await fetch(`https://keyb-2f31d-default-rtdb.asia-southeast1.firebasedatabase.app/keys/${keyStr}.json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
    });

    if (res.ok) {
        fetchKeys();
    } else {
        alert("Cập nhật trạng thái thất bại!");
    }
}

// --- QUẢN LÝ BYPASS MENU UIDS ---
async function fetchBypass() {
    try {
        let res = await fetch(FIREBASE_URLS.bypass);
        let data = await res.json();
        let tbody = document.getElementById('bypassTableBody');
        tbody.innerHTML = '';

        if (!data) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Không có UID nào bị liệt kê bypass.</td></tr>`;
            return;
        }

        // Sắp xếp theo thời gian cập nhật mới nhất lên đầu
        let sortedIds = Object.keys(data).sort((a, b) => {
            let ta = data[a].updated_at || 0;
            let tb = data[b].updated_at || 0;
            return tb - ta;
        });

        sortedIds.forEach(uid => {
            let info = data[uid];
            let updated = new Date(info.updated_at).toLocaleString();
            tbody.innerHTML += `
                <tr>
                    <td><code class="uid-code">${uid}</code></td>
                    <td>
                        <div class="toggle-wrap">
                            <label class="switch">
                                <input type="checkbox" ${info.enabled ? 'checked' : ''} onchange="toggleBypass('${uid}', this.checked)">
                                <span class="slider"></span>
                            </label>
                            <span class="badge ${info.enabled ? 'badge-danger' : 'badge-success'}">
                                ${info.enabled ? 'Đang bật' : 'Đã tắt'}
                            </span>
                        </div>
                    </td>
                    <td><small class="muted">${updated}</small></td>
                    <td><button class="btn btn-danger btn-sm" onclick="deleteBypassUid('${uid}')"><i class="fa-solid fa-trash"></i> Xóa</button></td>
                </tr>
            `;
        });
    } catch (e) {
        console.error(e);
    }
}

async function createBypass(e) {
    e.preventDefault();
    let uid = document.getElementById('bypassUidInput').value.trim();
    let enabled = document.getElementById('bypassStatusSelect').value === 'true';

    let updateObj = {};
    updateObj[uid] = {
        enabled: enabled,
        updated_at: Date.now()
    };

    let res = await fetch(FIREBASE_URLS.bypass, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateObj)
    });

    if (res.ok) {
        closeModal('bypassModal');
        fetchBypass();
        document.getElementById('bypassForm').reset();
    }
}

async function deleteBypassUid(uid) {
    if(confirm("Xóa UID này khỏi danh sách bypass?")) {
        await fetch(`https://keyb-2f31d-default-rtdb.asia-southeast1.firebasedatabase.app/bypass_menu_uids/${uid}.json`, {
            method: 'DELETE'
        });
        fetchBypass();
    }
}

// Bật / Tắt trạng thái bypass của một UID
async function toggleBypass(uid, enabled) {
    let updateObj = {};
    updateObj[uid] = {
        enabled: enabled,
        updated_at: Date.now()
    };

    let res = await fetch(FIREBASE_URLS.bypass, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateObj)
    });

    if (res.ok) {
        fetchBypass();
    } else {
        alert("Cập nhật trạng thái thất bại!");
        fetchBypass();
    }
}

// --- QUẢN LÝ DEVICE INFO ---
async function fetchDevices() {
    try {
        let res = await fetch(FIREBASE_URLS.devices);
        let data = await res.json();
        let tbody = document.getElementById('deviceTableBody');
        tbody.innerHTML = '';

        if (!data) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Chưa có thiết bị nào log vào hệ thống.</td></tr>`;
            return;
        }

        // Sắp xếp theo thời gian log mới nhất lên đầu
        let sortedIds = Object.keys(data).sort((a, b) => {
            let ta = data[a].timestamp || 0;
            let tb = data[b].timestamp || 0;
            return tb - ta;
        });

        sortedIds.forEach(uid => {
            let dev = data[uid];
            let logTime = new Date(dev.timestamp * 1000).toLocaleString();
            tbody.innerHTML += `
                <tr>
                    <td><code>${dev.uid || uid}</code></td>
                    <td>${dev.device_name || 'N/A'} (${dev.device_model || 'N/A'})</td>
                    <td>${dev.app_name || 'N/A'}<br><small>${dev.app_bundle_id || ''}</small></td>
                    <td><code>${dev.key || 'N/A'}</code></td>
                    <td>${dev.system_version || 'N/A'}</td>
                    <td>${logTime}</td>
                </tr>
            `;
        });
    } catch (e) {
        console.error(e);
    }
}

// --- HÀM HỖ TRỢ CHUNG ---
function openModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

async function deleteItem(endpoint, id) {
    if (confirm("Bạn có chắc chắn muốn xóa mục này?")) {
        let url = `https://keyb-2f31d-default-rtdb.asia-southeast1.firebasedatabase.app/${endpoint}/${id}.json`;
        let res = await fetch(url, { method: 'DELETE' });
        if (res.ok) {
            if(endpoint === 'packages') fetchPackages();
        }
    }
}