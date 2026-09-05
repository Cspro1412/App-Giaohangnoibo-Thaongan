const API_URL = "https://api-giaohang-noibo.onrender.com";

let allCustomers = [];
let myTasks = [];
let map, markersLayer, routeLine, driverMarker;
let ws; 
let offlineQueue = JSON.parse(localStorage.getItem('offlineQueue')) || []; 
let watchId = null; 

const customerIcon = new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], tooltipAnchor: [15, -20] });
const doneIcon = new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], tooltipAnchor: [15, -20] });

window.addEventListener('online', syncOfflineData);

function connectWebSocket() {
    let wsUrl = API_URL.replace("http://", "ws://").replace("https://", "wss://") + "/ws";
    ws = new WebSocket(wsUrl);
    ws.onmessage = function(event) {
        let msg = JSON.parse(event.data);
        if (msg.type === "REFRESH_LIST") refreshData(); 
        else if (msg.type === "REFRESH_VEHICLES") fetchVehiclesForDriver();
    };
    ws.onclose = function() { setTimeout(connectWebSocket, 3000); };
}

function switchTab(tab) {
    let tabMap = document.getElementById('tab-map');
    let tabList = document.getElementById('tab-list');
    let btnMap = document.getElementById('btn-tab-map');
    let btnList = document.getElementById('btn-tab-list');
    
    if (tab === 'map') {
        tabMap.style.display = 'block';
        tabList.style.display = 'none';
        btnMap.className = 'nav-item active';
        btnList.className = 'nav-item';
        if (map) {
            setTimeout(() => { map.invalidateSize(); }, 200);
        }
    } else {
        tabMap.style.display = 'none';
        tabList.style.display = 'block';
        btnMap.className = 'nav-item';
        btnList.className = 'nav-item active';
    }
}

async function initApp() {
    initMap();
    switchTab('map'); // Ép tab bản đồ khởi động đầu tiên, tab danh sách bị ẩn hoàn toàn
    await fetchVehiclesForDriver();
    await refreshData(); 
    connectWebSocket(); 
    startLiveTracking();
}

async function fetchVehiclesForDriver() {
    try {
        let res = await fetch(`${API_URL}/api/danh-sach-xe`);
        let result = await res.json();
        if (result.thanh_cong) {
            let select = document.getElementById("driver-vehicle-select");
            let saved = localStorage.getItem("DriverSelectedVehicle");
            let currentValue = select.value || saved;
            
            select.innerHTML = '<option value="">-- Chọn xe --</option>' + result.data.map(v => `<option value="${v}">${v}</option>`).join('');
            
            if (currentValue && result.data.includes(currentValue)) {
                select.value = currentValue;
                loadDriverData(false);
            } else {
                document.getElementById("loading").innerText = "Hãy chọn xe để nhận lộ trình!";
            }
        }
    } catch(e) { console.error("Lỗi tải danh sách xe"); }
}

function initMap() {
    map = L.map('map', { zoomControl: true }).setView([21.0285, 105.8542], 13);
    L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', { attribution: '© Google Maps' }).addTo(map);
    markersLayer = L.layerGroup().addTo(map);
    
    let driverIcon = L.divIcon({ className: 'marker-current-loc', iconSize: [16, 16], iconAnchor: [8,8] });
    driverMarker = L.marker([0,0], {icon: driverIcon}).addTo(map);
    driverMarker.setOpacity(0);
    
    loadFontSettings();
}

function onVehicleChange() {
    localStorage.setItem("DriverSelectedVehicle", document.getElementById("driver-vehicle-select").value);
    loadDriverData(false);
}

function loadDriverData(isAutoRefresh = false) {
    let xe = document.getElementById("driver-vehicle-select").value;
    let container = document.getElementById("driver-task-list");
    let scrollContainer = document.getElementById("tab-list");
    let currentScroll = scrollContainer ? scrollContainer.scrollTop : 0;
    
    container.innerHTML = "";
    markersLayer.clearLayers();
    if(routeLine) map.removeLayer(routeLine);
    document.getElementById("floating-card").style.display = "none";
    
    if (!xe) {
        document.getElementById("loading").innerText = "Hãy chọn xe để nhận lộ trình!";
        document.getElementById("loading").style.display = "block";
        return;
    }
    
    myTasks = allCustomers.filter(c => c.ten_xe === xe && c.lat !== null).sort((a, b) => (a.thu_tu || 9999) - (b.thu_tu || 9999));
    document.getElementById("loading").style.display = "none";
    
    if (myTasks.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding: 20px;">Chưa có đơn hàng nào!</div>';
        return;
    }
    
    let pendingTasks = myTasks.filter(t => t.trang_thai !== "Đã giao" && t.trang_thai !== "Không giao được");
    let latlngs = []; 
    let bounds = []; 
    let pointsToRender = [];
    
    myTasks.forEach((task, index) => {
        let isDone = (task.trang_thai === "Đã giao" || task.trang_thai === "Không giao được");
        let isCurrent = (!isDone && pendingTasks.length > 0 && task.id === pendingTasks[0].id);
        
        let cardClass = task.trang_thai === "Đã giao" ? "thanh-cong" : (task.trang_thai === "Không giao được" ? "that-bai" : "");
        let badgeClass = isCurrent ? "stt-badge stt-next" : "stt-badge";
        let badgeText = isCurrent ? `ĐANG ĐẾN ĐIỂM (#${index+1})` : `Điểm dừng #${index+1}`;
        
        let tuyenBadge = task.tuyen ? `<span style="font-size:11px; font-weight:bold; background:#fef3c7; color:#d97706; padding: 2px 6px; border-radius: 4px; border: 1px solid #fcd34d; margin-left: 6px;">📍 ${task.tuyen}</span>` : '';
        let noteBadge = task.ghi_chu ? `<div style="font-size: 12px; color: #ea580c; background: #ffedd5; padding: 6px; border-radius: 4px; margin-bottom: 8px; border: 1px dashed #fdba74;">📝 Ghi chú: <b>${task.ghi_chu}</b></div>` : '';
        
        let card = document.createElement("div");
        card.className = `trip-card ${cardClass}`;
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                <div style="display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
                    <span class="${badgeClass}">${badgeText}</span>
                    ${tuyenBadge}
                </div>
                <div onclick="promptNote(${task.id})" style="cursor:pointer; background:#e2e8f0; padding:4px 8px; border-radius:15px; font-size:11px; font-weight:bold; color:#475569;">📝 Ghi chú</div>
            </div>
            <div class="customer-name">${task.ten}</div>
            <div style="font-size: 12px; color: #64748b; margin-bottom: 8px;">Mã/SĐT: <b>${task.ma_khach}</b> | Trạng thái: <b>${task.trang_thai}</b></div>
            ${noteBadge}
            <div class="card-actions">
                <a href="https://www.google.com/maps/search/?api=1&query=${task.lat},${task.lng}" target="_blank" class="btn btn-map">Chỉ đường</a>
                <button class="btn status-chua-giao" onclick="updateStatus(${task.id}, 'Đang giao')">Đang giao</button>
                <button class="btn status-thanh-cong" onclick="updateStatus(${task.id}, 'Đã giao')">Xong</button>
                <button class="btn status-that-bai" onclick="updateStatus(${task.id}, 'Không giao được')">Hủy</button>
            </div>
        `;
        container.appendChild(card);
        
        latlngs.push([task.lat, task.lng]);
        bounds.push([task.lat, task.lng]);
        pointsToRender.push({ task: task, index: index, lat: task.lat, lng: task.lng, isDone: isDone });
    });
    
    let clusters = [];
    pointsToRender.forEach(p => {
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

    let showLabels = document.getElementById("show-labels-chk") ? document.getElementById("show-labels-chk").checked : true;

    pointsToRender.forEach(p => {
        let icon = p.isDone ? doneIcon : customerIcon;
        let markerLabel = `${p.index + 1}. ${p.task.ten}`;
        L.marker([p.lat, p.lng], {icon: icon}).bindTooltip(markerLabel, {permanent: showLabels, direction: p.dir, className: 'driver-tooltip'}).addTo(markersLayer);
    });
    
    routeLine = L.polyline(latlngs, {color: '#3b82f6', weight: 4, opacity: 0.6, dashArray: '10, 10'}).addTo(map);
    
    if(bounds.length > 0 && !isAutoRefresh) map.fitBounds(bounds, {padding: [30, 30]});
    if(scrollContainer) setTimeout(() => { scrollContainer.scrollTop = currentScroll; }, 10);
    
    if(pendingTasks.length > 0) {
        let currentCustomer = pendingTasks[0];
        let nextCustomer = pendingTasks.length > 1 ? pendingTasks[1] : null;
        
        document.getElementById("floating-card").style.display = "block";
        document.getElementById("float-name").innerText = currentCustomer.ten;
        document.getElementById("float-btn").href = `https://www.google.com/maps/search/?api=1&query=${currentCustomer.lat},${currentCustomer.lng}`;
        
        if (nextCustomer) document.getElementById("float-next").innerHTML = `<b>Tiếp theo:</b> ${nextCustomer.ten}`;
        else document.getElementById("float-next").innerHTML = `<span style="color: #10b981; font-weight: bold;">✅ Đây là điểm giao cuối cùng!</span>`;
    }
}

function pushToOfflineQueue(khId, action, value) {
    let existingIdx = offlineQueue.findIndex(q => q.khId === khId && q.action === action);
    if(existingIdx > -1) offlineQueue[existingIdx].value = value;
    else offlineQueue.push({ khId: khId, action: action, value: value });
    localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
}

function promptNote(khId) {
    let task = allCustomers.find(c => c.id === khId);
    let currentNote = task.ghi_chu || "";
    let note = prompt(`📝 Nhập ghi chú riêng cho [${task.ten}]:`, currentNote);
    if (note !== null) updateNoteAPI(khId, note);
}

async function updateNoteAPI(khId, note) {
    let task = allCustomers.find(c => c.id === khId);
    if (task) { task.ghi_chu = note; localStorage.setItem('cached_customers', JSON.stringify(allCustomers)); }
    loadDriverData(true); 

    if (!navigator.onLine) { pushToOfflineQueue(khId, 'NOTE', note); return; }

    try { await fetch(`${API_URL}/api/ghi-chu/${khId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ghi_chu: note }) }); } 
    catch (e) { pushToOfflineQueue(khId, 'NOTE', note); }
}

async function updateStatus(khId, newStatus) {
    let task = allCustomers.find(c => c.id === khId);
    if (task) { task.trang_thai = newStatus; localStorage.setItem('cached_customers', JSON.stringify(allCustomers)); }
    loadDriverData(true);

    if (!navigator.onLine) { pushToOfflineQueue(khId, 'STATUS', newStatus); return; }

    try { await fetch(`${API_URL}/api/cap-nhat-trang-thai/${khId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({trang_thai: newStatus }) }); } 
    catch (e) { pushToOfflineQueue(khId, 'STATUS', newStatus); }
}

async function syncOfflineData() {
    if (offlineQueue.length === 0) return;
    let remainingQueue = []; 
    for (let item of offlineQueue) {
        try {
            let url = item.action === 'STATUS' ? `${API_URL}/api/cap-nhat-trang-thai/${item.khId}` : `${API_URL}/api/ghi-chu/${item.khId}`;
            let bodyData = item.action === 'STATUS' ? { trang_thai: item.value } : { ghi_chu: item.value };
            let res = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bodyData) });
            let result = await res.json();
            if (!result.thanh_cong) remainingQueue.push(item);
        } catch(e) { remainingQueue.push(item); }
    }
    offlineQueue = remainingQueue;
    if (offlineQueue.length > 0) localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
    else localStorage.removeItem('offlineQueue');
    await refreshData();
}

async function refreshData() {
    try {
        let res = await fetch(`${API_URL}/api/danh-sach-khach-hang`);
        let result = await res.json();
        if (result.thanh_cong) {
            allCustomers = result.data;
            localStorage.setItem('cached_customers', JSON.stringify(allCustomers));
            loadDriverData(true);
        }
    } catch(e) {
        let cached = localStorage.getItem('cached_customers');
        if (cached) { allCustomers = JSON.parse(cached); loadDriverData(true); } 
        else document.getElementById("loading").innerHTML = "❌ Đang mất mạng và không có dữ liệu cũ!";
    }
}

function startLiveTracking() {
    if ("geolocation" in navigator) {
        watchId = navigator.geolocation.watchPosition(
            (position) => {
                let xe = document.getElementById("driver-vehicle-select").value;
                if(!xe) return;
                let lat = position.coords.latitude, lng = position.coords.longitude;
                driverMarker.setLatLng([lat, lng]); driverMarker.setOpacity(1);
                
                if (navigator.onLine) {
                    fetch(`${API_URL}/api/cap-nhat-vi-tri-xe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ten_xe: xe, lat: lat, lng: lng}) }).catch(e => {});
                }
            },
            (error) => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
        );
    }
}

function updateMapFont() {
    let familySelect = document.getElementById("font-family-select"), sizeSelect = document.getElementById("font-size-select"), colorSelect = document.getElementById("font-color-select");
    if (!familySelect || !sizeSelect || !colorSelect) return;
    let fontFamily = familySelect.value, fontSize = sizeSelect.value, fontColor = colorSelect.value;
    let styleTag = document.getElementById("dynamic-map-font");
    if (!styleTag) { styleTag = document.createElement("style"); styleTag.id = "dynamic-map-font"; document.head.appendChild(styleTag); }
    styleTag.innerHTML = `.leaflet-tooltip.driver-tooltip { font-family: ${fontFamily} !important; font-size: ${fontSize} !important; color: ${fontColor} !important; }`;
    localStorage.setItem("DriverFontSettings", JSON.stringify({ fontFamily, fontSize, fontColor }));
}

function loadFontSettings() {
    let saved = localStorage.getItem("DriverFontSettings");
    if (saved) {
        try {
            let parsed = JSON.parse(saved);
            let fam = document.getElementById("font-family-select"), siz = document.getElementById("font-size-select"), col = document.getElementById("font-color-select");
            if(parsed.fontFamily && fam) fam.value = parsed.fontFamily;
            if(parsed.fontSize && siz) siz.value = parsed.fontSize;
            if(parsed.fontColor && col) col.value = parsed.fontColor;
        } catch(e) {}
    }
    updateMapFont();
}

setInterval(refreshData, 60000);
window.onload = initApp;
