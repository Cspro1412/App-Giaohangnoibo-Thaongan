const API_URL = "https://api-giaohang-noibo.onrender.com";

let map, warehouses = [], customers = [], masterData = [], routeLayers = [];
let customerMarkersLayer, masterDataMarkersLayer;
let isShowingMasterData = false;

let vehicles = [];
let tuyens = [];
let currentVehicleFilter = "all";
let currentTuyenFilter = "all";
let ws; 

const routeColors = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777'];
const warehouseIcon = new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], tooltipAnchor: [15, -20] });
const customerIcon = new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], tooltipAnchor: [15, -20] });
const masterIcon = new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], tooltipAnchor: [15, -20] });
let liveTruckMarkers = {};

function getTruckIcon(truckName) {
    let idx = vehicles.indexOf(truckName);
    if (idx === -1) idx = 0; 
    let color = routeColors[idx % routeColors.length] || '#000'; 
    let html = `<div style="background-color: ${color}; width: 34px; height: 34px; border-radius: 50%; border: 3px solid white; box-shadow: 0 3px 6px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; font-size: 16px; color: white;">🚚</div>`;
    return L.divIcon({ className: 'custom-truck-div-icon', html: html, iconSize: [40, 40], iconAnchor: [20, 20] });
}

function removeVietnameseTones(str) {
    if (!str) return "";
    str = str.toLowerCase();
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
    str = str.replace(/đ/g, "d");
    return str;
}

document.addEventListener("click", function(e) {
    if(e.target.id !== "quick-search-input") {
        let res = document.getElementById("quick-search-results");
        if(res) res.style.display = "none";
    }
});

function handleQuickSearch() {
    let keyword = removeVietnameseTones(document.getElementById("quick-search-input").value.trim());
    let resultUl = document.getElementById("quick-search-results");
    resultUl.innerHTML = "";
    if (!keyword) { resultUl.style.display = "none"; return; }
    let filtered = masterData.filter(d => d.ma_khach.toLowerCase().includes(keyword) || removeVietnameseTones(d.ten_khach).includes(keyword));
    if (filtered.length === 0) { resultUl.innerHTML = '<li style="color: #94a3b8;">Không tìm thấy khách hàng...</li>'; resultUl.style.display = "block"; return; }
    filtered.forEach(d => {
        let li = document.createElement("li");
        let missingLabel = (d.lat === null) ? ` <span style="color: #ef4444; font-size:10px;">(⚠️ Thiếu tọa độ)</span>` : "";
        li.innerHTML = `<b>${d.ten_khach}</b> <br><span style="color:#64748b;">SĐT: ${d.ma_khach}</span>${missingLabel}`;
        li.onclick = () => addCustomerFromQuickSearch(d.ma_khach, d.ten_khach, d.du_lieu_goc);
        resultUl.appendChild(li);
    });
    resultUl.style.display = "block";
}

async function addCustomerFromQuickSearch(ma, ten, dulieu) {
    let xe = document.getElementById("quick-vehicle-select").value;
    let tuyen = document.getElementById("quick-tuyen-select").value;
    document.getElementById("quick-search-input").value = "";
    document.getElementById("quick-search-results").style.display = "none";
    try {
        let res = await fetch(`${API_URL}/api/them-khach-hang`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ma_khach: ma, ten_khach_hang: ten, du_lieu_goc: dulieu, ten_xe: xe, tuyen: tuyen })
        });
        let result = await res.json();
        if (result.thanh_cong) { if(!dulieu) alert(`⚠️ Đã thêm [${ten}]. Khách này đang thiếu tọa độ!`); } 
        else { alert("❌ Lỗi API: " + result.loi); }
    } catch (e) { alert("⚠️ Không kết nối được máy chủ!"); }
}

async function fetchVehiclesFromAPI() {
    try {
        let res = await fetch(`${API_URL}/api/danh-sach-xe`);
        let result = await res.json();
        if (result.thanh_cong) { vehicles = result.data.length > 0 ? result.data : []; updateVehicleUI(); }
    } catch (e) { console.error("Lỗi lấy xe"); }
}

async function fetchTuyensFromAPI() {
    try {
        let res = await fetch(`${API_URL}/api/danh-sach-tuyen`);
        let result = await res.json();
        if (result.thanh_cong) { tuyens = result.data.length > 0 ? result.data : []; updateTuyenUI(); }
    } catch (e) { console.error("Lỗi lấy tuyến"); }
}

async function addNewVehicle() {
    let input = document.getElementById("new-vehicle-name").value.trim();
    if (!input) return;
    document.getElementById("new-vehicle-name").value = "Đang xử lý...";
    try {
        await fetch(`${API_URL}/api/them-xe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ten_xe: input }) });
        document.getElementById("new-vehicle-name").value = "";
    } catch(e) { alert("Lỗi mạng!"); }
}

async function deleteVehicle(vName) {
    if (confirm(`Xóa xe [${vName}] trên toàn hệ thống?`)) {
        try {
            await fetch(`${API_URL}/api/xoa-xe`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ten_xe: vName }) });
            if(currentVehicleFilter === vName) currentVehicleFilter = "all";
        } catch(e) { alert("Lỗi mạng!"); }
    }
}

async function addNewTuyen() {
    let input = document.getElementById("new-tuyen-name").value.trim();
    if (!input) return;
    document.getElementById("new-tuyen-name").value = "Đang xử lý...";
    try {
        await fetch(`${API_URL}/api/them-tuyen`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ten_tuyen: input }) });
        document.getElementById("new-tuyen-name").value = "";
    } catch(e) { alert("Lỗi mạng!"); }
}

async function deleteTuyen(tName) {
    if (confirm(`Xóa Tuyến [${tName}] trên toàn hệ thống?`)) {
        try {
            await fetch(`${API_URL}/api/xoa-tuyen`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ten_tuyen: tName }) });
            if(currentTuyenFilter === tName) currentTuyenFilter = "all";
        } catch(e) { alert("Lỗi mạng!"); }
    }
}

function updateVehicleUI() {
    let tagsDiv = document.getElementById("vehicle-tags");
    tagsDiv.innerHTML = vehicles.map(v => `<span class="route-chip">${v} <span class="route-delete" onclick="deleteVehicle('${v}')">×</span></span>`).join('');
    let options = vehicles.map(v => `<option value="${v}">${v}</option>`).join('');
    let optionWithDefault = `<option value="">-- Chưa Phân Xe --</option>` + options;
    
    let bulkSel = document.getElementById("bulk-vehicle-select"), singleSel = document.getElementById("single-vehicle-select"), quickSel = document.getElementById("quick-vehicle-select");
    let oldBulk = bulkSel ? bulkSel.value : "", oldSingle = singleSel ? singleSel.value : "", oldQuick = quickSel ? quickSel.value : "";
    
    if(bulkSel) bulkSel.innerHTML = optionWithDefault;
    if(singleSel) singleSel.innerHTML = optionWithDefault;
    if(quickSel) quickSel.innerHTML = optionWithDefault;
    
    if (oldBulk) bulkSel.value = oldBulk;
    if (oldSingle) singleSel.value = oldSingle;
    if (oldQuick) quickSel.value = oldQuick;
    
    let filterSelect = document.getElementById("filter-vehicle-select");
    filterSelect.innerHTML = `<option value="all">🌍 HIỂN THỊ TẤT CẢ XE</option>` + vehicles.map(v => `<option value="${v}">🚛 Xe: ${v}</option>`).join('');
    filterSelect.value = currentVehicleFilter;
}

function updateTuyenUI() {
    let tagsDiv = document.getElementById("tuyen-tags");
    tagsDiv.innerHTML = tuyens.map(t => `<span class="route-chip" style="background:#fef3c7; border-color:#fcd34d;">${t} <span class="route-delete" onclick="deleteTuyen('${t}')">×</span></span>`).join('');
    let options = tuyens.map(t => `<option value="${t}">${t}</option>`).join('');
    let optionWithDefault = `<option value="">-- Chọn Tuyến (Tùy chọn) --</option>` + options;
    let optionWithAll = `<option value="all">🌍 TẤT CẢ CÁC TUYẾN</option>` + options;
    
    let bulkSel = document.getElementById("bulk-tuyen-select"), singleSel = document.getElementById("single-tuyen-select"), quickSel = document.getElementById("quick-tuyen-select"), dbNewSel = document.getElementById("db-new-tuyen");
    let oldBulk = bulkSel ? bulkSel.value : "", oldSingle = singleSel ? singleSel.value : "", oldQuick = quickSel ? quickSel.value : "", oldDbNew = dbNewSel ? dbNewSel.value : "";
    
    if(bulkSel) bulkSel.innerHTML = optionWithDefault;
    if(singleSel) singleSel.innerHTML = optionWithDefault;
    if(quickSel) quickSel.innerHTML = optionWithDefault;
    if(dbNewSel) dbNewSel.innerHTML = optionWithDefault;
    
    if (oldBulk) bulkSel.value = oldBulk;
    if (oldSingle) singleSel.value = oldSingle;
    if (oldQuick) quickSel.value = oldQuick;
    if (oldDbNew) dbNewSel.value = oldDbNew;
    
    let dbFilter = document.getElementById("db-filter-tuyen");
    let oldDbFilter = dbFilter ? dbFilter.value : "all";
    if(dbFilter) { dbFilter.innerHTML = optionWithAll; dbFilter.value = oldDbFilter; }
    
    let filterSelect = document.getElementById("filter-tuyen-select");
    filterSelect.innerHTML = optionWithAll;
    filterSelect.value = currentTuyenFilter;
}

document.addEventListener("DOMContentLoaded", () => {
    const ul = document.getElementById("list-ul");
    if(ul) {
        ul.addEventListener("dragover", (e) => {
            e.preventDefault();
            const afterElement = getDragAfterElement(ul, e.clientY);
            const draggable = document.querySelector('.dragging');
            if (draggable) {
                if (afterElement == null) ul.appendChild(draggable);
                else ul.insertBefore(draggable, afterElement);
            }
        });
    }
});

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.customer-item:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) return { offset: offset, element: child };
        else return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function handleDropAction() {
    const items = [...document.querySelectorAll('#list-ul .customer-item')];
    let newOrder = []; let currentThuTu = 1;
    items.forEach((item) => {
        let itemId = parseInt(item.getAttribute('data-id'));
        if(!isNaN(itemId)) {
            newOrder.push({ id: itemId, thu_tu: currentThuTu });
            let cust = customers.find(c => c.id === itemId);
            if(cust) cust.thu_tu = currentThuTu;
            currentThuTu++;
        }
    });
    renderCustomerList(); drawFixedRoute(); 
    try { await fetch(`${API_URL}/api/cap-nhat-thu-tu`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newOrder) }); } catch(e) {}
}

async function drawFixedRoute() {
    if (warehouses.length === 0) return;
    let routesToProcess = currentVehicleFilter === "all" ? vehicles : [currentVehicleFilter];
    clearRoutes();
    for (let i = 0; i < routesToProcess.length; i++) {
        let vName = routesToProcess[i];
        let color = routeColors[i % routeColors.length];
        let activeCustomers = customers.filter(c => c.selected && c.ten_xe === vName && c.lat !== null && c.lng !== null && (currentTuyenFilter === "all" || c.tuyen === currentTuyenFilter));
        activeCustomers.sort((a, b) => (a.thu_tu || 9999) - (b.thu_tu || 9999));
        
        if (activeCustomers.length === 0) continue;
        let allPoints = [warehouses[0], ...activeCustomers];
        let coordsString = allPoints.map(p => `${p.lng},${p.lat}`).join(';');
        let apiUrl = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`;
        
        try {
            let response = await fetch(apiUrl);
            let data = await response.json();
            if (data.code !== 'Ok') continue;
            let layer = L.geoJSON(data.routes[0].geometry, { style: { color: color, weight: 6, opacity: 0.8 } }).addTo(map);
            routeLayers.push(layer); 
        } catch (error) {}
    }
}

function connectWebSocket() {
    let wsUrl = API_URL.replace("http://", "ws://").replace("https://", "wss://") + "/ws";
    ws = new WebSocket(wsUrl);
    ws.onopen = function() { fetchCustomersFromAPI(); fetchInitialGPS(); };
    ws.onmessage = function(event) {
        let msg = JSON.parse(event.data);
        if (msg.type === "REFRESH_LIST") { fetchCustomersFromAPI(); fetchDanhBaSilently(); } 
        else if (msg.type === "REFRESH_VEHICLES") { fetchVehiclesFromAPI(); }
        else if (msg.type === "REFRESH_ROUTES") { fetchTuyensFromAPI(); }
        else if (msg.type === "GPS_UPDATE") {
            let t = msg.data;
            if(!liveTruckMarkers[t.ten_xe]) {
                liveTruckMarkers[t.ten_xe] = L.marker([t.lat, t.lng], {icon: getTruckIcon(t.ten_xe)}).bindTooltip("🚚 " + t.ten_xe, {permanent: true, direction: 'top', offset: [0, -20], className: 'truck-tooltip'}).addTo(map);
            } else { liveTruckMarkers[t.ten_xe].setLatLng([t.lat, t.lng]); }
        }
    };
    ws.onclose = function() { setTimeout(connectWebSocket, 3000); };
}

window.onload = checkLogin;
function checkLogin() {
    if (localStorage.getItem("admin_logged_in") === "true") { document.getElementById("login-overlay").style.display = "none"; initMap(); } 
    else { document.getElementById("login-overlay").style.display = "flex"; }
}

async function loginAdmin() {
    let pwd = document.getElementById("admin-password").value;
    if (!pwd) { alert("Vui lòng nhập mật khẩu!"); return; }
    let btn = document.querySelector(".login-box button"); let oldText = btn.innerText; btn.innerText = "Đang kiểm tra...";
    try {
        let res = await fetch(`${API_URL}/api/xac-thuc`, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ mat_khau: pwd }) });
        let result = await res.json();
        if (result.thanh_cong) { localStorage.setItem("admin_logged_in", "true"); document.getElementById("login-overlay").style.display = "none"; initMap(); } 
        else { alert("❌ " + result.loi); btn.innerText = oldText; }
    } catch (e) { alert("⚠️ Không kết nối được máy chủ Python!"); btn.innerText = oldText; }
}
function logoutAdmin() { localStorage.removeItem("admin_logged_in"); location.reload(); }

async function initMap() {
    map = L.map('map').setView([21.0285, 105.8542], 13);
    // BẢN ĐỒ GOOGLE MAPS SIÊU NHANH
    L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', { attribution: '© Google Maps' }).addTo(map);
    customerMarkersLayer = L.layerGroup().addTo(map);
    masterDataMarkersLayer = L.layerGroup().addTo(map);
    loadFontSettings();
    
    const savedLocal = localStorage.getItem('GiaoHangConfig');
    if (savedLocal) {
        const parsed = JSON.parse(savedLocal);
        if (parsed.warehouses) warehouses = parsed.warehouses;
    }
    
    await fetchVehiclesFromAPI();
    await fetchTuyensFromAPI();
    await fetchDanhBaSilently();
    connectWebSocket(); 
}

async function fetchInitialGPS() {
    try {
        let res = await fetch(`${API_URL}/api/lay-vi-tri-xe`);
        let result = await res.json();
        if (result.thanh_cong) {
            let activeTrucks = result.data.map(t => t.ten_xe);
            for (let truckName in liveTruckMarkers) { if (!activeTrucks.includes(truckName)) { map.removeLayer(liveTruckMarkers[truckName]); delete liveTruckMarkers[truckName]; } }
            result.data.forEach(t => {
                if(!liveTruckMarkers[t.ten_xe]) { liveTruckMarkers[t.ten_xe] = L.marker([t.lat, t.lng], {icon: getTruckIcon(t.ten_xe)}).bindTooltip("🚚 " + t.ten_xe, {permanent: true, direction: 'top', offset: [0, -20], className: 'truck-tooltip'}).addTo(map); } 
                else { liveTruckMarkers[t.ten_xe].setLatLng([t.lat, t.lng]); }
            });
        }
    } catch(e) {}
}

function updateMapFont() {
    let fam = document.getElementById("font-family-select"), siz = document.getElementById("font-size-select"), col = document.getElementById("font-color-select");
    if (!fam || !siz || !col) return;
    let styleTag = document.getElementById("dynamic-map-font");
    if (!styleTag) { styleTag = document.createElement("style"); styleTag.id = "dynamic-map-font"; document.head.appendChild(styleTag); }
    styleTag.innerHTML = `.leaflet-tooltip.custom-tooltip, .leaflet-tooltip.warehouse-tooltip, .leaflet-tooltip.master-tooltip { font-family: ${fam.value} !important; font-size: ${siz.value} !important; } .leaflet-tooltip.master-tooltip { color: ${col.value} !important; }`;
    localStorage.setItem("GiaoHangFontSettings", JSON.stringify({ fontFamily: fam.value, fontSize: siz.value, fontColor: col.value }));
}
function loadFontSettings() {
    let saved = localStorage.getItem("GiaoHangFontSettings");
    if (saved) {
        try {
            let p = JSON.parse(saved);
            if(p.fontFamily) document.getElementById("font-family-select").value = p.fontFamily;
            if(p.fontSize) document.getElementById("font-size-select").value = p.fontSize;
            if(p.fontColor) document.getElementById("font-color-select").value = p.fontColor;
        } catch(e) {}
    }
    updateMapFont();
}

async function fetchDanhBaSilently() {
    try {
        let res = await fetch(`${API_URL}/api/danh-ba`);
        let result = await res.json();
        if (result.thanh_cong) { masterData = result.data; renderMasterDataOnMap(); }
    } catch(e) {}
}

function toggleMasterDataMap() {
    isShowingMasterData = !isShowingMasterData;
    let btn = document.getElementById("btn-toggle-master-map");
    if (isShowingMasterData) { btn.innerHTML = "👀 ẨN TOÀN BỘ DANH BẠ KHỎI BẢN ĐỒ"; btn.style.backgroundColor = "#0ea5e9"; } 
    else { btn.innerHTML = "👀 HIỆN TOÀN BỘ DANH BẠ LÊN BẢN ĐỒ"; btn.style.backgroundColor = "#64748b"; }
    renderMasterDataOnMap();
}

function renderMasterDataOnMap() {
    masterDataMarkersLayer.clearLayers();
    if (!isShowingMasterData) return;
    let showLabels = document.getElementById("show-labels-chk") ? document.getElementById("show-labels-chk").checked : true;
    let validData = masterData.filter(d => d.lat !== null && d.lng !== null);
    if(currentTuyenFilter !== "all") validData = validData.filter(d => d.tuyen === currentTuyenFilter);

    let clusters = [];
    validData.forEach(p => {
        let added = false;
        for (let cluster of clusters) {
            let center = cluster[0];
            if (map.distance([p.lat, p.lng], [center.lat, center.lng]) < 150) { cluster.push(p); added = true; break; }
        }
        if (!added) clusters.push([p]);
    });
    const dirs = ['right', 'left', 'top', 'bottom'];
    clusters.forEach(cluster => {
        if (cluster.length === 1) cluster[0].dir = 'right';
        else { cluster.sort((a, b) => a.lng - b.lng); cluster.forEach((p, idx) => p.dir = dirs[idx % 4]); }
    });
    validData.forEach(d => {
        let title = d.tuyen ? `[${d.tuyen}] ${d.ten_khach}` : d.ten_khach;
        L.marker([d.lat, d.lng], {icon: masterIcon}).bindTooltip(title, { permanent: showLabels, direction: d.dir, className: "master-tooltip" }).addTo(masterDataMarkersLayer);
    });
}

function saveLocalConfig() { localStorage.setItem('GiaoHangConfig', JSON.stringify({ warehouses: warehouses })); } 

async function fetchCustomersFromAPI() {
    if (document.querySelector('.dragging')) { setTimeout(fetchCustomersFromAPI, 2000); return; }
    try {
        let res = await fetch(`${API_URL}/api/danh-sach-khach-hang`);
        let result = await res.json();
        if (result.thanh_cong) {
            let oldSelected = {};
            customers.forEach(c => oldSelected[c.id] = c.selected);
            customers = result.data.map(c => ({
                id: c.id, ma_khach: c.ma_khach, name: c.ten, lat: c.lat, lng: c.lng,
                rawInput: c.rawInput, ten_xe: c.ten_xe, tuyen: c.tuyen, trang_thai: c.trang_thai, thu_tu: c.thu_tu, ghi_chu: c.ghi_chu,
                selected: oldSelected[c.id] !== undefined ? oldSelected[c.id] : true
            }));
        }
    } catch (error) {}
    renderCustomerList();
}

function extractCoords(input) {
    input = input.trim();
    if (!input) return null;
    if (input.startsWith('http://') || input.startsWith('https://')) {
        let match3d4d = input.match(/!3d(-?\d+\.\d+).*?!4d(-?\d+\.\d+)/);
        if (match3d4d) return { lat: parseFloat(match3d4d[1]), lng: parseFloat(match3d4d[2]) };
        let match4d3d = input.match(/!4d(-?\d+\.\d+).*?!3d(-?\d+\.\d+)/);
        if (match4d3d) return { lat: parseFloat(match4d3d[2]), lng: parseFloat(match4d3d[1]) };
        let matchPlace = input.match(/(?:place|search|dir(?:\/[^\/]+)?)\/(-?\d+\.\d+)[,;%2C]+(-?\d+\.\d+)/);
        if (matchPlace) return { lat: parseFloat(matchPlace[1]), lng: parseFloat(matchPlace[2]) };
        let matchQ = input.match(/[?&](?:q|query|ll)=(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/);
        if (matchQ) return { lat: parseFloat(matchQ[1]), lng: parseFloat(matchQ[2]) };
        let matchAt = input.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (matchAt) return { lat: parseFloat(matchAt[1]), lng: parseFloat(matchAt[2]) };
        return null;
    } else {
        let cleanInput = input.replace(/[^\d., -]/g, ' ').trim();
        let parts = cleanInput.split(/[, ]+/).filter(p => p !== "");
        if(parts.length >= 2) {
            let lat = parseFloat(parts[0]), lng = parseFloat(parts[1]);
            if (!isNaN(lat) && !isNaN(lng)) return { lat: lat, lng: lng }; 
        }
        return null;
    }
}

// FIX LỖI KHO KHÔNG LƯU ĐƯỢC
function addWarehouse() {
    let nameInput = document.getElementById("warehouse-name");
    let name = nameInput && nameInput.value.trim() ? nameInput.value.trim() : "Kho " + (warehouses.length + 1);
    let input = document.getElementById("warehouse-coords").value;
    let coords = extractCoords(input);
    if (!coords) { alert("Vui lòng nhập Link Maps hoặc tọa độ hợp lệ!"); return; }
    warehouses.push({ id: 'W' + Date.now(), name: name, lat: coords.lat, lng: coords.lng, rawInput: input });
    if(nameInput) nameInput.value = ""; 
    document.getElementById("warehouse-coords").value = "";
    saveLocalConfig(); renderCustomerList(); 
}

function deleteWarehouse(id) { warehouses = warehouses.filter(w => w.id !== id); saveLocalConfig(); renderCustomerList(); }

function onFilterChange() { 
    currentVehicleFilter = document.getElementById("filter-vehicle-select").value; 
    currentTuyenFilter = document.getElementById("filter-tuyen-select").value; 
    clearRoutes(); renderCustomerList(); renderMasterDataOnMap();
}
function onSearchInput() { renderCustomerList(); }

async function addSingleCustomer() {
    let name = document.getElementById("single-name").value.trim();
    let input = document.getElementById("single-coords").value.trim();
    let xe = document.getElementById("single-vehicle-select").value;
    let tuyen = document.getElementById("single-tuyen-select").value;
    if (!name) { alert("Vui lòng nhập SĐT hoặc Tên!"); return; }
    document.getElementById("single-name").value = "⏳ ...";
    try {
        let res = await fetch(`${API_URL}/api/them-khach-hang`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ma_khach: name, ten_khach_hang: name, du_lieu_goc: input, ten_xe: xe, tuyen: tuyen })
        });
        let result = await res.json();
        if (result.thanh_cong) {
            document.getElementById("single-name").value = ""; document.getElementById("single-coords").value = "";
            if(!result.has_coords && !input) alert(`⚠️ Đã lưu nháp [${name}]. Hãy bổ sung tọa độ sau!`);
        } else { alert("❌ Lỗi API: " + result.loi); document.getElementById("single-name").value = name; }
    } catch (e) { alert("⚠️ Lỗi kết nối!"); document.getElementById("single-name").value = name; }
}

async function bulkAddCustomers() {
    let text = document.getElementById("bulk-input").value;
    let lines = text.split('\n').map(l => l.trim()).filter(l => l !== "");
    if (lines.length === 0) { alert("Hãy dán danh sách khách hàng vào ô trống!"); return; }
    let xe = document.getElementById("bulk-vehicle-select").value;
    let tuyen = document.getElementById("bulk-tuyen-select").value;
    document.getElementById("bulk-input").value = "⏳ Đang quét danh bạ gốc và phân tuyến...";
    try {
        let res = await fetch(`${API_URL}/api/them-hang-loat`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ danh_sach_khach: lines, ten_xe: xe, tuyen: tuyen })
        });
        let result = await res.json();
        if (result.thanh_cong) { document.getElementById("bulk-input").value = ""; alert("✅ " + result.thong_bao); } 
        else { alert("❌ Lỗi máy chủ: " + result.loi); document.getElementById("bulk-input").value = text; }
    } catch (e) { alert("⚠️ Không kết nối được máy chủ!"); document.getElementById("bulk-input").value = text; }
}

// FIX LỖI KHÔNG LƯU ĐƯỢC CHỈNH SỬA ĐƠN HÀNG
async function saveCustomer(id) {
    let newName = document.getElementById(`edit-name-${id}`).value.trim();
    let newInput = document.getElementById(`edit-input-${id}`).value.trim();
    let newXe = document.getElementById(`edit-xe-${id}`).value;
    let newTuyen = document.getElementById(`edit-tuyen-${id}`).value;
    if (!newName) { alert("Vui lòng nhập tên!"); return; }
    
    let btn = document.querySelector(`#edit-name-${id}`).parentElement.querySelector('.btn-save');
    if(btn) btn.innerText = "Đang lưu...";

    try {
        let res = await fetch(`${API_URL}/api/cap-nhat-thong-tin/${id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ten_khach_hang: newName, du_lieu_goc: newInput, ten_xe: newXe, tuyen: newTuyen })
        });
        let result = await res.json();
        if (!result.thanh_cong) { 
            alert("❌ Lỗi cập nhật: " + result.loi); 
            if(btn) btn.innerText = "Lưu";
        } else {
            // Tải lại để thoát chế độ chỉnh sửa
            fetchCustomersFromAPI(); 
        }
    } catch(e) { alert("⚠️ Lỗi kết nối đến máy chủ!"); if(btn) btn.innerText = "Lưu"; }
}

async function saveMissingCoords(id) {
    let input = document.getElementById(`edit-input-${id}`).value;
    let name = document.getElementById(`edit-name-${id}`).value;
    if (!input) { alert("Chưa nhập link/tọa độ!"); return; }
    try {
        let res = await fetch(`${API_URL}/api/cap-nhat-thong-tin/${id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ten_khach_hang: name, du_lieu_goc: input })
        });
        let result = await res.json();
        if (!result.thanh_cong) { alert("❌ Lỗi cập nhật: " + result.loi); }
        else { fetchCustomersFromAPI(); }
    } catch(e) { alert("⚠️ Lỗi kết nối!"); }
}

async function deleteCustomer(id) {
    if (!confirm("Xóa khách hàng này khỏi CHUYẾN ĐI?\n(Danh bạ gốc sẽ không bị xóa)")) return;
    try { await fetch(`${API_URL}/api/xoa-khach-hang/${id}`, { method: "DELETE" }); } catch (e) { alert("⚠️ Lỗi mạng khi xóa!"); }
}

async function exportAndClearData() {
    if (!confirm("BẠN MUỐN CHỐT CA?\nHệ thống sẽ tải file Báo cáo Excel xuống, sau đó làm sạch bản đồ. Bạn đồng ý chứ?")) return;
    let reportData = customers.map((c, index) => ({
        "STT": index + 1, "Tên Xe": c.ten_xe, "Tuyến": c.tuyen, "Mã KH / SĐT": c.ma_khach, "Tên Khách Hàng": c.name, "Trạng Thái": c.trang_thai, "Ghi Chú": c.ghi_chu || "", "Dữ liệu gốc": c.rawInput
    }));
    if (reportData.length > 0) {
        let wsSheet = XLSX.utils.json_to_sheet(reportData); let wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, wsSheet, "BaoCao");
        let d = new Date(); XLSX.writeFile(wb, `BaoCaoGiaoHang_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.xlsx`);
    } else { alert("Chưa có dữ liệu!"); }
    try {
        let res = await fetch(`${API_URL}/api/xoa-toan-bo`, { method: "DELETE" });
        let result = await res.json();
        if (result.thanh_cong) { alert("✅ Đã chốt ca thành công!"); location.reload(); } 
    } catch (e) { alert("⚠️ Lỗi kết nối mạng!"); }
}

function toggleMapLabels() { renderCustomerList(); renderMasterDataOnMap(); }
function toggleCustomer(id, isChecked) { let index = customers.findIndex(c => c.id === id); if (index > -1) { customers[index].selected = isChecked; renderCustomerList(); } }
function toggleSelectAll(selectAll) {
    let keyword = removeVietnameseTones(document.getElementById("search-input").value.trim());
    customers.forEach(c => {
        if ((currentVehicleFilter === "all" || c.ten_xe === currentVehicleFilter) && (currentTuyenFilter === "all" || c.tuyen === currentTuyenFilter)) {
            if (!keyword || removeVietnameseTones(c.name).includes(keyword) || c.ma_khach.toLowerCase().includes(keyword)) c.selected = selectAll;
        }
    });
    renderCustomerList();
}

function clearRoutes() { routeLayers.forEach(layer => map.removeLayer(layer)); routeLayers = []; }

function renderCustomerList(editId = null) {
    customerMarkersLayer.clearLayers(); 
    
    let wDiv = document.getElementById("warehouse-list");
    wDiv.innerHTML = warehouses.map(w => `<div style="display:flex; justify-content:space-between; padding:5px; background:#f1f5f9; border-radius:4px; margin-bottom:4px;">
        <span><b>${w.name}</b> <span style="color:#94a3b8;">(${w.lat.toFixed(4)}, ${w.lng.toFixed(4)})</span></span>
        <button style="width:auto; padding:2px 6px; background:#ef4444; border:none; color:white; border-radius:3px; cursor:pointer;" onclick="deleteWarehouse('${w.id}')">✖</button>
    </div>`).join('');
    
    let keyword = removeVietnameseTones(document.getElementById("search-input").value.trim());
    let filtered = customers.filter(c => (currentVehicleFilter === "all" || c.ten_xe === currentVehicleFilter) && (currentTuyenFilter === "all" || c.tuyen === currentTuyenFilter));
    if (keyword) filtered = filtered.filter(c => removeVietnameseTones(c.name).includes(keyword) || c.ma_khach.toLowerCase().includes(keyword));
    
    filtered.sort((a, b) => (a.thu_tu || 9999) - (b.thu_tu || 9999));
    document.getElementById("count-kh").innerText = filtered.length;
    
    let ul = document.getElementById("list-ul");
    ul.innerHTML = "";
    
    let boundsPoints = [];
    let showLabels = document.getElementById("show-labels-chk").checked;

    warehouses.forEach(w => {
        boundsPoints.push([w.lat, w.lng]);
        L.marker([w.lat, w.lng], {icon: warehouseIcon}).bindTooltip("🏠 " + w.name, {permanent: showLabels, direction: 'right', className: "warehouse-tooltip", interactive: true}).addTo(customerMarkersLayer);
    });

    let activeCustomers = filtered.filter(c => c.selected && c.lat !== null && c.lng !== null);
    let clusters = [];
    activeCustomers.forEach(p => {
        let added = false;
        for (let cluster of clusters) {
            let center = cluster[0];
            if (map.distance([p.lat, p.lng], [center.lat, center.lng]) < 150) { cluster.push(p); added = true; break; }
        }
        if (!added) clusters.push([p]);
    });
    
    const dirs = ['right', 'left', 'top', 'bottom'];
    clusters.forEach(cluster => {
        if (cluster.length === 1) { cluster[0].dir = 'right'; }
        else { cluster.sort((a, b) => a.lng - b.lng); cluster.forEach((p, idx) => { p.dir = dirs[idx % 4]; }); }
    });

    filtered.forEach(c => {
        let hasCoords = (c.lat !== null && c.lng !== null);
        if (hasCoords && c.selected) {
            boundsPoints.push([c.lat, c.lng]);
            L.marker([c.lat, c.lng], {icon: customerIcon}).bindTooltip(c.name, {permanent: showLabels, direction: c.dir, className: "custom-tooltip", interactive: true}).addTo(customerMarkersLayer);
        }

        let li = document.createElement("li");
        
        if (c.id === editId) {
            let vehicleOptions = `<option value="">-- Chưa Phân Xe --</option>` + vehicles.map(v => `<option value="${v}" ${c.ten_xe === v ? 'selected': ''}>${v}</option>`).join('');
            let tuyenOptions = `<option value="">-- Mặc định --</option>` + tuyens.map(t => `<option value="${t}" ${c.tuyen === t ? 'selected': ''}>${t}</option>`).join('');
            
            li.className = "customer-item";
            li.style.borderLeft = "4px solid #3b82f6";
            li.innerHTML = `
                <div style="font-weight:bold; margin-bottom: 5px; font-size:12px; color:#666;">Chỉnh sửa thông tin:</div>
                <input type="text" id="edit-name-${c.id}" value="${c.name}" style="width: 100%; margin-bottom: 5px; padding:6px; box-sizing: border-box;" placeholder="Tên">
                <input type="text" id="edit-input-${c.id}" value="${c.rawInput}" style="width: 100%; margin-bottom: 5px; padding:6px; box-sizing: border-box;" placeholder="Link Maps hoặc Tọa độ">
                <div style="display:flex; gap:5px;">
                    <select id="edit-xe-${c.id}" style="flex:1; padding:6px; margin-bottom:8px; border:1px solid #ccc; border-radius:4px;">${vehicleOptions}</select>
                    <select id="edit-tuyen-${c.id}" style="flex:1; padding:6px; margin-bottom:8px; border:1px solid #ccc; border-radius:4px;">${tuyenOptions}</select>
                </div>
                <div class="action-btns">
                    <button class="btn-sm btn-save" style="background: #10b981;" onclick="saveCustomer(${c.id})">Lưu</button>
                    <button class="btn-sm btn-cancel" style="background:#64748b;" onclick="renderCustomerList()">Hủy</button>
                </div>
            `;
        } else if (!hasCoords) {
            li.className = "customer-item customer-missing";
            li.innerHTML = `
                <div style="font-weight:bold; color:#b91c1c; margin-bottom:5px;">⚠️ Bổ sung thông tin cho: ${c.ma_khach}</div>
                <input type="text" id="edit-name-${c.id}" value="${c.name}" style="width:100%; margin-bottom:5px; padding:6px; box-sizing:border-box;" placeholder="Tên">
                <input type="text" id="edit-input-${c.id}" value="${c.rawInput}" style="width:100%; margin-bottom:5px; padding:6px; box-sizing:border-box;" placeholder="Link Maps hoặc Tọa độ">
                <div class="action-btns">
                    <button class="btn-sm btn-warning" onclick="saveMissingCoords(${c.id})">Lưu Tọa Độ</button>
                    <button class="btn-sm btn-delete" onclick="deleteCustomer(${c.id})">Xóa</button>
                </div>
            `;
        } else {
            li.className = "customer-item " + (c.selected ? "" : "customer-disabled");
            let statusColor = "#64748b", bgStatus = "transparent";
            if (c.trang_thai === "Đã giao") { statusColor = "#10b981"; bgStatus = "#d1fae5"; }
            else if (c.trang_thai === "Không giao được") { statusColor = "#ef4444"; bgStatus = "#fee2e2"; }
            else if (c.trang_thai === "Đang giao") { statusColor = "#f59e0b"; bgStatus = "#fef3c7"; }

            let tuyenBadge = c.tuyen ? `<span style="font-size:10px; font-weight:bold; background:#fef3c7; color:#d97706; padding: 2px 6px; border-radius: 4px; border: 1px solid #fcd34d; margin-left:4px;">📍 ${c.tuyen}</span>` : '';
            let badge = `<span class="route-badge">${c.ten_xe || 'Chưa phân xe'}</span> ${tuyenBadge}`;
            let thuTuDisplay = c.thu_tu ? `<span style="color:#2563eb; margin-right:4px;">#${c.thu_tu}</span>` : '';
            let noteBadge = c.ghi_chu ? `<div style="font-size: 12px; color: #ea580c; background: #ffedd5; padding: 4px 8px; border-radius: 4px; margin-top: 6px; border: 1px dashed #fdba74; width: fit-content;">📝 ${c.ghi_chu}</div>` : '';
            
            let isDraggable = !keyword; 
            if (isDraggable) {
                li.setAttribute('draggable', 'true'); li.setAttribute('data-id', c.id);
                li.addEventListener('dragstart', () => li.classList.add('dragging'));
                li.addEventListener('dragend', () => { li.classList.remove('dragging'); handleDropAction(); });
            }

            li.innerHTML = `
                <div style="display: flex; align-items: flex-start; width: 100%;">
                    ${isDraggable ? `<div class="drag-handle" title="Kéo thả để sắp xếp">☰</div>` : ''}
                    <input type="checkbox" class="cust-check" ${c.selected ? 'checked' : ''} onchange="toggleCustomer(${c.id}, this.checked)">
                    <div style="flex-grow: 1; min-width: 0;"> 
                        <div class="badges-wrapper">
                            <div>${badge}</div>
                            <span style="font-size:11px; font-weight:bold; color:${statusColor}; background:${bgStatus}; padding: 3px 6px; border-radius: 4px;">${c.trang_thai}</span>
                        </div>
                        <div style="font-weight: bold; font-size: 14px; color: ${c.selected ? '#0f172a' : '#94a3b8'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 4px;">
                            ${thuTuDisplay}${c.name}
                        </div>
                        ${noteBadge}
                        <div class="action-btns">
                            <button class="btn-sm btn-edit" onclick="renderCustomerList(${c.id})">Sửa</button>
                            <button class="btn-sm btn-delete" onclick="deleteCustomer(${c.id})">Xóa</button>
                        </div>
                    </div>
                </div>
            `;
        }
        ul.appendChild(li);
    });

    if (editId === null && boundsPoints.length > 1) map.fitBounds(boundsPoints, { padding: [50, 50] });
}

async function calculateOptimizedRoute() {
    if (warehouses.length === 0) { alert("Vui lòng thiết lập ít nhất 1 Kho hàng trước!"); return; }
    let routesToProcess = currentVehicleFilter === "all" ? vehicles : [currentVehicleFilter];
    clearRoutes();
    
    let summaryText = "🚀 KẾT QUẢ TỐI ƯU LỘ TRÌNH:\n\n";
    let hasSuccess = false;
    
    for (let i = 0; i < routesToProcess.length; i++) {
        let vName = routesToProcess[i];
        let color = routeColors[i % routeColors.length];
        let activeCustomers = customers.filter(c => c.selected && c.ten_xe === vName && c.lat !== null && c.lng !== null && (currentTuyenFilter === "all" || c.tuyen === currentTuyenFilter));
        let missingCount = customers.filter(c => c.selected && c.ten_xe === vName && (c.lat === null || c.lng === null)).length;
        
        if (activeCustomers.length === 0) continue;
        let allPoints = [warehouses[0], ...activeCustomers];
        let coordsString = allPoints.map(p => `${p.lng},${p.lat}`).join(';');
        let apiUrl = `https://router.project-osrm.org/trip/v1/driving/${coordsString}?roundtrip=true&source=first&geometries=geojson`;
        
        try {
            let response = await fetch(apiUrl);
            let data = await response.json();
            if (data.code !== 'Ok') continue;
            
            let layer = L.geoJSON(data.trips[0].geometry, { style: { color: color, weight: 6, opacity: 0.8 } }).addTo(map);
            routeLayers.push(layer); 
            hasSuccess = true;
            
            let waypoints = data.waypoints;
            let orderedPoints = new Array(allPoints.length);
            waypoints.forEach((wp, index) => { orderedPoints[wp.waypoint_index] = allPoints[index]; });
            
            let updateOrderData = [];
            orderedPoints.forEach((p, idx) => {
                if(p.id && !p.id.toString().startsWith('W')) {
                    updateOrderData.push({ id: p.id, thu_tu: idx + 1});
                    let cust = customers.find(c => c.id === p.id);
                    if(cust) cust.thu_tu = idx + 1;
                }
            });
            renderCustomerList(); 
            
            if(updateOrderData.length > 0) fetch(`${API_URL}/api/cap-nhat-thu-tu`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updateOrderData) }).catch(e => {});
            
            summaryText += `🚛 [${vName.toUpperCase()}]\n`;
            if (missingCount > 0) summaryText += `   ⚠️ (Bỏ qua ${missingCount} khách chưa có tọa độ)\n`;
            orderedPoints.forEach((p, idx) => { 
                let prefix = p.id && p.id.toString().startsWith('W') ? "🏠 KHO: " : "📦 ";
                summaryText += `   ${idx + 1}. ${prefix}${p.name}\n`; 
            });
            let distanceKm = (data.trips[0].distance / 1000).toFixed(1);
            let durationMin = Math.round(data.trips[0].duration / 60);
            summaryText += `   => Quãng đường: ~${distanceKm} km | Thời gian lái xe: ~${durationMin} phút\n\n`;
            
        } catch (error) { console.error("Lỗi OSRM", error); }
    }
    if (hasSuccess) alert(summaryText); else alert("Không có điểm hợp lệ nào để vẽ đường!");
}

async function openDanhBa() { document.getElementById("danh-ba-modal").style.display = "flex"; await fetchDanhBa(); }
function closeDanhBa() { document.getElementById("danh-ba-modal").style.display = "none"; }

async function fetchDanhBa() {
    try {
        let res = await fetch(`${API_URL}/api/danh-ba`);
        let result = await res.json();
        if(result.thanh_cong) { masterData = result.data; renderDanhBaList(); renderMasterDataOnMap(); }
    } catch(e) { alert("Lỗi tải Danh Bạ Gốc!"); }
}

function renderDanhBaList(editDbId = null) {
    let container = document.getElementById("db-list-container");
    container.innerHTML = "";
    
    let keyword = removeVietnameseTones(document.getElementById("db-search").value.trim());
    let filterTuyenDB = document.getElementById("db-filter-tuyen") ? document.getElementById("db-filter-tuyen").value : "all";
    
    let filtered = masterData;
    if(filterTuyenDB !== "all") filtered = filtered.filter(d => d.tuyen === filterTuyenDB);
    if(keyword) filtered = filtered.filter(d => d.ma_khach.toLowerCase().includes(keyword) || removeVietnameseTones(d.ten_khach).includes(keyword));
    
    filtered.forEach(d => {
        let isMissing = (d.lat === null || d.lng === null);
        let html = "";
        
        if (d.id === editDbId) {
            let tuyenOptions = `<option value="">-- Trống --</option>` + tuyens.map(t => `<option value="${t}" ${d.tuyen === t ? 'selected': ''}>${t}</option>`).join('');
            html = `
                <div><input type="text" id="db-edit-ma-${d.id}" value="${d.ma_khach}" style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px;"></div>
                <div><input type="text" id="db-edit-name-${d.id}" value="${d.ten_khach}" style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px;"></div>
                <div><select id="db-edit-tuyen-${d.id}" style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px;">${tuyenOptions}</select></div>
                <div><input type="text" id="db-edit-input-${d.id}" value="${d.du_lieu_goc}" style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px;"></div>
                <div style="display: flex; gap: 5px; justify-content:center;">
                    <button style="padding:6px; font-size:12px; background: #10b981; color: white; border:none; border-radius:4px; cursor:pointer;" onclick="saveDanhBa(${d.id})">Lưu</button>
                    <button style="padding:6px; font-size:12px; background: #64748b; color: white; border:none; border-radius:4px; cursor:pointer;" onclick="renderDanhBaList()">Hủy</button>
                </div>
            `;
        } else {
            let coordsText = isMissing ? `<span style="color:#ef4444; font-weight:bold;">⚠️ Chưa có tọa độ</span>` : `OK (${d.lat.toFixed(4)}, ${d.lng.toFixed(4)})`;
            let tuyenText = d.tuyen ? `<span style="background:#fef3c7; color:#d97706; padding: 2px 6px; border-radius: 4px; border: 1px solid #fcd34d; font-size: 11px; font-weight: bold;">${d.tuyen}</span>` : `<span style="color:#94a3b8; font-size:11px;">Chưa phân</span>`;
            
            html = `
                <div style="font-weight: bold; color: #0f172a;">${d.ma_khach}</div>
                <div style="color: #334155;">${d.ten_khach}</div>
                <div>${tuyenText}</div>
                <div style="font-size: 11px;">${coordsText}<br><span style="color:#94a3b8; font-style: italic;">${d.du_lieu_goc}</span></div>
                <div style="display: flex; gap: 5px; justify-content:center;">
                    <button style="padding:6px; font-size:12px; background: #3b82f6; color: white; border:none; border-radius:4px; cursor:pointer;" onclick="renderDanhBaList(${d.id})">Sửa</button>
                    <button style="padding:6px; font-size:12px; background: #ef4444; color: white; border:none; border-radius:4px; cursor:pointer;" onclick="deleteDanhBa(${d.id})">Xóa</button>
                </div>
            `;
        }
        let row = document.createElement("div"); row.className = "db-row"; row.style.gridTemplateColumns = "1.5fr 2fr 1.5fr 3.5fr 1.5fr"; row.innerHTML = html; container.appendChild(row);
    });
}

async function saveDanhBa(id) {
    let ma = document.getElementById(`db-edit-ma-${id}`).value.trim();
    let name = document.getElementById(`db-edit-name-${id}`).value.trim();
    let tuyen = document.getElementById(`db-edit-tuyen-${id}`).value;
    let input = document.getElementById(`db-edit-input-${id}`).value.trim();
    if(!ma || !name) { alert("Thiếu thông tin bắt buộc!"); return; }
    try {
        let res = await fetch(`${API_URL}/api/danh-ba/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ma_khach: ma, ten_khach: name, tuyen: tuyen, du_lieu_goc: input }) });
        let result = await res.json();
        if(result.thanh_cong) { fetchDanhBaSilently(); fetchDanhBa(); fetchCustomersFromAPI(); } else { alert("❌ Lỗi: " + result.loi); }
    } catch(e) { alert("⚠️ Lỗi kết nối API!"); }
}

async function deleteDanhBa(id) {
    if (!confirm("⚠️ CẢNH BÁO: Xóa vĩnh viễn khách này khỏi Danh bạ gốc?")) return;
    try {
        let res = await fetch(`${API_URL}/api/danh-ba/${id}`, { method: "DELETE" });
        let result = await res.json();
        if (result.thanh_cong) fetchDanhBa(); else alert("❌ Lỗi xóa: " + result.loi);
    } catch (e) { alert("⚠️ Lỗi kết nối API!"); }
}

async function importDanhBaExcel() {
    let fileInput = document.getElementById('db-excel-file');
    let file = fileInput.files[0];
    if (!file) { alert("Vui lòng chọn file Excel!"); return; }
    let reader = new FileReader();
    reader.onload = async function(e) {
        try {
            let workbook = XLSX.read(new Uint8Array(e.target.result), {type: 'array'});
            let rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {header: 1});
            let danh_sach = [];
            rows.forEach((row, index) => {
                if (index === 0 && row[0] && typeof row[0] === 'string' && (row[0].toLowerCase().includes("sdt") || row[0].toLowerCase().includes("mã"))) return;
                if (row.length >= 1 && row[0]) {
                    danh_sach.push({ 
                        ma_khach: row[0].toString().trim(), 
                        ten_khach: (row[1] ? row[1].toString().trim() : ""), 
                        du_lieu_goc: (row[2] ? row[2].toString().trim() : ""),
                        tuyen: (row[3] ? row[3].toString().trim() : "")
                    });
                }
            });
            if (danh_sach.length > 0) {
                document.getElementById('db-excel-file').disabled = true;
                let res = await fetch(`${API_URL}/api/nhap-danh-ba-excel`, { method: "POST", headers: { "Content-Type": "application/json"}, body: JSON.stringify({ danh_sach: danh_sach }) });
                let result = await res.json();
                if (result.thanh_cong) { alert("✅ " + result.thong_bao); await fetchDanhBaSilently(); await fetchDanhBa(); } else { alert("❌ Lỗi: " + result.loi); }
                document.getElementById('db-excel-file').disabled = false; fileInput.value = "";
            } else { alert("Không tìm thấy dữ liệu hợp lệ trong file Excel."); }
        } catch (error) { alert("Lỗi đọc file Excel."); }
    };
    reader.readAsArrayBuffer(file);
}

async function addSingleDanhBa() {
    let ma = document.getElementById("db-new-ma").value.trim(), ten = document.getElementById("db-new-ten").value.trim(), input = document.getElementById("db-new-coords").value.trim(), tuyen = document.getElementById("db-new-tuyen").value;
    if(!ma) { alert("Vui lòng nhập Mã KH / SĐT!"); return; }
    try {
        let res = await fetch(`${API_URL}/api/nhap-danh-ba-excel`, { method: "POST", headers: { "Content-Type": "application/json"}, body: JSON.stringify({ danh_sach: [{ ma_khach: ma, ten_khach: ten, du_lieu_goc: input, tuyen: tuyen }] }) });
        let result = await res.json();
        if (result.thanh_cong) {
            document.getElementById("db-new-ma").value = ""; document.getElementById("db-new-ten").value = ""; document.getElementById("db-new-coords").value = "";
            await fetchDanhBaSilently(); await fetchDanhBa();
        } else { alert("Lỗi: " + result.loi); }
    } catch(e) { alert("Lỗi kết nối!"); }
}
