// CONFIGURACIÓN DE SUPABASE
const SUPABASE_URL = 'https://yuppkdlmjgneyzpuwupq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1cHBrZGxtamduZXl6cHV3dXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NTgyNzYsImV4cCI6MjEwNDQzNDI3Nn0.oJY0jks32BYBttOm5FYgBhAn-cIw5F6qDaXFh10No78';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let cestaMateriales = [];
let cestaNumeroOrdenActual = 'ORD-0000';
let listaRequestTemp = [];
let usuarioActual = null;
let productoEditandoId = null;
let comprasContabilidad = [];
let compraEditandoTaxId = null;

document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();

  const sesionGuardada = localStorage.getItem('sesion_usuario');
  if (sesionGuardada) {
    usuarioActual = JSON.parse(sesionGuardada);
    iniciarInterfaz();
  }

  document.getElementById('login-form').addEventListener('submit', iniciarSesion);
  document.getElementById('product-form').addEventListener('submit', guardarProducto);
  document.getElementById('movement-form').addEventListener('submit', registrarMovimiento);
  
  const purchaseForm = document.getElementById('purchase-form');
  if (purchaseForm) purchaseForm.addEventListener('submit', registrarCompra);
  inicializarControlesTaxes();

  const dispatchForm = document.getElementById('dispatch-form');
  if (dispatchForm) dispatchForm.addEventListener('submit', registrarSalidaModule);

  const returnForm = document.getElementById('return-form');
  if (returnForm) returnForm.addEventListener('submit', registrarDevolucionParcial);

  const obraForm = document.getElementById('obra-form');
  if (obraForm) obraForm.addEventListener('submit', registrarObra);

  const contractorForm = document.getElementById('contractor-form');
  if (contractorForm) contractorForm.addEventListener('submit', registrarContratista);

  const providerForm = document.getElementById('provider-form');
  if (providerForm) providerForm.addEventListener('submit', registrarProveedor);
});

// ==========================================
// 1. AUTENTICACIÓN Y CONTROL DE ROLES (3 NIVELES)
// ==========================================
async function iniciarSesion(e) {
  e.preventDefault();

  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const password = document.getElementById('login-password').value.trim();

  const { data: usuario, error } = await _supabase
    .from('usuarios')
    .select('*')
    .ilike('email', email)
    .eq('password', password)
    .maybeSingle();

  if (error) {
    console.error('Error al consultar usuarios en Supabase:', error);
    return alert('Error de conexión con la base de datos: ' + error.message);
  }

  if (!usuario) {
    return alert('Credenciales incorrectas. Verifique que el correo y la contraseña coincidan exactamente.');
  }

  usuarioActual = usuario;
  localStorage.setItem('sesion_usuario', JSON.stringify(usuario));
  iniciarInterfaz();
}

function cerrarSesion() {
  localStorage.removeItem('sesion_usuario');
  usuarioActual = null;
  document.getElementById('login-screen').style.display = 'grid';
  document.getElementById('login-form').reset();
}

function iniciarInterfaz() {
  document.getElementById('login-screen').style.display = 'none';
  
  const superAdmins = [
    'axell@myeasysolutions.com',
    'arvin@myeasysolutions.com',
    'elias@myeasysolutions.com'
  ];

  const correoActual = (usuarioActual && usuarioActual.email) ? usuarioActual.email.trim().toLowerCase() : '';

  if (superAdmins.includes(correoActual)) {
    usuarioActual.rol = 'SUPERADMIN';
    localStorage.setItem('sesion_usuario', JSON.stringify(usuarioActual));
  } else if (!usuarioActual.rol) {
    usuarioActual.rol = 'GERENTE';
  }

  let rolEtiqueta = 'Gerente de Obra';
  if (usuarioActual.rol === 'SUPERADMIN') rolEtiqueta = 'SuperAdmin';
  if (usuarioActual.rol === 'ADMIN') rolEtiqueta = 'Administrador';

  const badge = document.getElementById('user-badge');
  if (badge) badge.innerText = `${usuarioActual.nombre} (${rolEtiqueta})`;

  const elName = document.getElementById('dropdown-user-name');
  const elRole = document.getElementById('dropdown-user-role');
  if (elName) elName.innerText = usuarioActual.nombre;
  if (elRole) elRole.innerText = rolEtiqueta;

  aplicarPermisosRol();
  cargarDatos();
  suscribirPresenciaEnVivo();
  escucharNotificacionesRequests();
}

function aplicarPermisosRol() {
  const rol = usuarioActual ? usuarioActual.rol : 'GERENTE';
  const esSuperAdmin = rol === 'SUPERADMIN';
  const esAdmin = rol === 'ADMIN' || esSuperAdmin;

  document.querySelectorAll('[data-role="SUPERADMIN"]').forEach(el => {
    el.style.display = esSuperAdmin ? '' : 'none';
  });

  document.querySelectorAll('[data-role="ADMIN"]').forEach(el => {
    el.style.display = esAdmin ? '' : 'none';
  });

  document.querySelectorAll('[data-role="ALL"]').forEach(el => {
    el.style.display = '';
  });

  const btnNuevoProd = document.getElementById('btn-nuevo-prod-header');
  if (btnNuevoProd) btnNuevoProd.style.display = esAdmin ? 'flex' : 'none';
}

// ==========================================
// GESTIÓN DE PERFIL, MENÚ Y CONTRASEÑA
// ==========================================
function toggleUserDropdown() {
  const menu = document.getElementById('user-dropdown-menu');
  if (!menu) return;
  menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}

document.addEventListener('click', (e) => {
  const btn = document.getElementById('user-menu-btn');
  const menu = document.getElementById('user-dropdown-menu');
  if (btn && menu && !btn.contains(e.target) && !menu.contains(e.target)) {
    menu.style.display = 'none';
  }
});

function openChangePasswordModal() {
  const menu = document.getElementById('user-dropdown-menu');
  if (menu) menu.style.display = 'none';
  const modal = document.getElementById('modal-change-password');
  if (modal) modal.classList.add('open');
}

function closeChangePasswordModal() {
  const modal = document.getElementById('modal-change-password');
  if (modal) modal.classList.remove('open');
  const form = document.getElementById('change-password-form');
  if (form) form.reset();
}

async function guardarNuevaContrasena(e) {
  e.preventDefault();

  if (!usuarioActual) return alert('No hay una sesión activa.');

  const passActual = document.getElementById('pass-actual').value.trim();
  const passNueva = document.getElementById('pass-nueva').value.trim();
  const passConfirmar = document.getElementById('pass-confirmar').value.trim();

  if (passActual !== usuarioActual.password) {
    return alert('La contraseña actual ingresada es incorrecta.');
  }

  if (passNueva.length < 6) {
    return alert('La nueva contraseña debe tener al menos 6 caracteres.');
  }

  if (passNueva !== passConfirmar) {
    return alert('La nueva contraseña y su confirmación no coinciden.');
  }

  const { error } = await _supabase
    .from('usuarios')
    .update({ password: passNueva })
    .eq('id', usuarioActual.id);

  if (error) {
    return alert('Error al actualizar la contraseña: ' + error.message);
  }

  usuarioActual.password = passNueva;
  localStorage.setItem('sesion_usuario', JSON.stringify(usuarioActual));

  alert('¡Contraseña actualizada con éxito!');
  closeChangePasswordModal();
}

// ==========================================
// PRESENCIA EN TIEMPO REAL (USUARIOS ACTIVOS)
// ==========================================
function suscribirPresenciaEnVivo() {
  if (!usuarioActual) return;

  const channel = _supabase.channel('online-users', {
    config: {
      presence: { key: usuarioActual.email },
    },
  });

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      renderizarUsuariosConectados(state);
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          nombre: usuarioActual.nombre,
          email: usuarioActual.email,
          inicial: usuarioActual.nombre ? usuarioActual.nombre.charAt(0).toUpperCase() : 'U'
        });
      }
    });
}

function renderizarUsuariosConectados(state) {
  const container = document.getElementById('online-users-container');
  if (!container) return;

  const usuarios = [];
  Object.values(state).forEach(presences => {
    presences.forEach(p => usuarios.push(p));
  });

  const colores = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

  container.innerHTML = usuarios.map((u, idx) => {
    const colorBg = colores[idx % colores.length];
    return `
      <div title="${u.nombre} (${u.email})" style="
        width: 32px; 
        height: 32px; 
        border-radius: 50%; 
        background: ${colorBg}; 
        color: white; 
        display: flex; 
        align-items: center; 
        justify-content: center; 
        font-size: 0.85rem; 
        font-weight: 700; 
        border: 2px solid #fff;
        margin-left: -8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.15);
        cursor: pointer;
        transition: transform 0.2s;
      " onmouseover="this.style.transform='scale(1.15)'" onmouseout="this.style.transform='scale(1)'">
        ${u.inicial}
      </div>
    `;
  }).join('');
}

// ==========================================
// NOTIFICACIONES FLOTANTES PERSISTENTES (TOAST)
// ==========================================
function escucharNotificacionesRequests() {
  _supabase
    .channel('requests-realtime')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'requests'
      },
      (payload) => {
        const nuevoReq = payload.new;
        
        cargarHistorialRequests();

        if (nuevoReq && usuarioActual && nuevoReq.created_by !== usuarioActual.nombre) {
          mostrarNotificacionFlotante(nuevoReq);
        }
      }
    )
    .subscribe();
}

function mostrarNotificacionFlotante(req) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toastId = `toast-${Date.now()}`;
  const toast = document.createElement('div');
  toast.id = toastId;
  toast.style.cssText = `
    background: #ffffff;
    border-left: 5px solid var(--header-green);
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.25);
    padding: 12px 16px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    color: var(--text-dark);
    font-family: inherit;
    animation: slideInRight 0.3s ease;
  `;

  toast.innerHTML = `
    <div style="background: #dcfce7; color: #16a34a; padding: 8px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
      <i data-lucide="bell" style="width: 18px; height: 18px;"></i>
    </div>
    <div style="flex-grow: 1;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <strong style="font-size: 0.85rem; color: var(--text-dark);">¡Nuevo Request Recibido!</strong>
        <span style="font-size: 0.7rem; color: var(--text-muted);">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
      </div>
      <p style="font-size: 0.78rem; margin: 0; color: var(--text-muted); line-height: 1.3;">
        <b>${req.created_by || 'WFH'}</b> ha enviado la solicitud <b>${req.numero_orden || ''}</b> para <b>${req.obra_destino}</b>.
      </p>
      <button onclick="irARequests('${toastId}')" style="background: none; border: none; color: var(--primary-blue); font-size: 0.75rem; font-weight: 700; padding: 0; margin-top: 6px; cursor: pointer; text-decoration: underline;">
        Ver en tabla de Requests
      </button>
    </div>
    <button onclick="cerrarToast('${toastId}')" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 1.1rem; font-weight: 700; padding: 0; line-height: 1;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#94a3b8'">
      &times;
    </button>
  `;

  container.appendChild(toast);
  lucide.createIcons();
}

function cerrarToast(id) {
  const toast = document.getElementById(id);
  if (toast) {
    toast.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }
}

function irARequests(toastId) {
  switchTab('etiquetas');
  cerrarToast(toastId);
}

// ==========================================
// 2. CARGA GENERAL DE DATOS
// ==========================================
async function cargarDatos() {
  const { data: productos, error: errProd } = await _supabase.from('productos').select('*');
  if (errProd) console.error('Error cargando productos:', errProd);

  const { data: movimientos, error: errMov } = await _supabase
    .from('movimientos')
    .select('*, productos(nombre, costo_unitario)')
    .order('fecha', { ascending: false });
  if (errMov) console.error('Error cargando movimientos:', errMov);

  const { data: salidasRecientes, error: errSal } = await _supabase
    .from('salidas')
    .select('*, productos(nombre)')
    .order('fecha', { ascending: false });
  if (errSal) console.error('Error cargando salidas para dashboard:', errSal);

  const { data: obras, error: errObras } = await _supabase.from('obras').select('*');
  if (errObras) console.error('Error cargando obras:', errObras);

  const { data: contratistas, error: errCnt } = await _supabase.from('contratistas').select('*');
  if (errCnt) console.error('Error cargando contratistas:', errCnt);

  const { data: proveedores, error: errProv } = await _supabase.from('proveedores').select('*');
  if (errProv) console.error('Error cargando proveedores:', errProv);

  renderizarDashboard(productos || [], movimientos || [], obras || [], salidasRecientes || []);
  renderizarTablaInventario(productos || []);
  renderizarMovimientos(movimientos || []);
  cargarHistorialCompras();
  cargarHistorialSalidas();
  cargarSalidasParaDevolucion();
  cargarHistorialDevoluciones();
  cargarHistorialRequests();
  cargarRequestTracking();
  
  poblarSelectProductos(productos || []);
  poblarSelectObras(obras || []);
  poblarSelectContratistas(contratistas || []);
  poblarSelectProveedores(proveedores || []);

  renderizarTablaObras(obras || []);
  cargarContratistas(contratistas || []);
  renderizarTablaProveedores(proveedores || []);
}

// ==========================================
// 3. DASHBOARD Y KPIs (PROTEGIDO)
// ==========================================
function renderizarDashboard(productos, movimientos, obras, salidasRecientes) {
  const elMat = document.getElementById('kpi-materiales');
  if (elMat) elMat.innerText = productos.length;

  const totalValor = productos.reduce((sum, p) => sum + (p.stock_actual * (p.costo_unitario || 0)), 0);
  const elVal = document.getElementById('kpi-valor');
  if (elVal) elVal.innerText = `$${totalValor.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const criticos = productos.filter(p => p.stock_actual <= p.stock_minimo && p.stock_actual > 0);
  const elCrit = document.getElementById('kpi-critico');
  if (elCrit) elCrit.innerText = criticos.length;

  const agotados = productos.filter(p => p.stock_actual === 0);
  const elAgot = document.getElementById('kpi-agotados');
  if (elAgot) elAgot.innerText = agotados.length;

  const obrasActivas = obras.filter(o => !o.estado || o.estado.toLowerCase() === 'activa');
  const kpiObras = document.getElementById('kpi-obras-count');
  if (kpiObras) kpiObras.innerText = obrasActivas.length;

  const dashWorksContainer = document.getElementById('dash-works');
  if (dashWorksContainer) {
    if (obrasActivas.length === 0) {
      dashWorksContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.8rem;">Sin obras activas registradas.</p>';
    } else {
      dashWorksContainer.innerHTML = obrasActivas.slice(0, 5).map(o => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 0.5rem 0; border-bottom:1px solid var(--sidebar-border)">
          <div>
            <strong style="font-size:0.85rem; color:var(--text-dark);">${o.direccion || o.nombre}</strong>
            <div style="font-size:0.72rem; color:var(--text-muted);">${o.subdivision && o.subdivision !== 'N/A' ? o.subdivision : ''} ${o.county && o.county !== 'N/A' ? '• ' + o.county : ''}</div>
          </div>
          <div>
            <span class="badge badge-in">${o.estado || 'Activa'}</span>
          </div>
        </div>
      `).join('');
    }
  }

  const ahora = new Date();
  const mesActual = ahora.getMonth();
  const anioActual = ahora.getFullYear();

  let totalEntradas = 0;
  let totalSalidas = 0;

  movimientos.forEach(m => {
    const fechaMov = new Date(m.fecha);
    if (fechaMov.getMonth() === mesActual && fechaMov.getFullYear() === anioActual) {
      const costo = m.productos?.costo_unitario || 0;
      const subtotal = m.cantidad * costo;

      if (m.tipo === 'ENTRADA' && !m.salida_origen_id) totalEntradas += subtotal; // Evita contar devoluciones como nuevas compras
      if (m.tipo === 'SALIDA') totalSalidas += subtotal;
    }
  });

  const elEnt = document.getElementById('kpi-entradas');
  if (elEnt) elEnt.innerText = `$${totalEntradas.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  
  const elSal = document.getElementById('kpi-salidas');
  if (elSal) elSal.innerText = `$${totalSalidas.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const categoriasMap = {};
  productos.forEach(p => {
    if (p.categoria) {
      categoriasMap[p.categoria] = (categoriasMap[p.categoria] || 0) + p.stock_actual;
    }
  });

  const numCategorias = Object.keys(categoriasMap).length;
  const elCatCount = document.getElementById('kpi-cat-count');
  if (elCatCount) elCatCount.innerText = `${numCategorias} categorías`;

  const dashCatContainer = document.getElementById('dash-categories');
  if (dashCatContainer) {
    const maxStock = Math.max(...Object.values(categoriasMap), 1);
    if (numCategorias === 0) {
      dashCatContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.8rem;">No hay categorías registradas.</p>';
    } else {
      dashCatContainer.innerHTML = Object.entries(categoriasMap).map(([cat, cant]) => {
        const pct = Math.min((cant / maxStock) * 100, 100);
        return `
          <div class="cat-row">
            <div class="cat-labels">
              <strong>${cat}</strong>
              <span style="color: var(--text-muted);">${cant} unidades</span>
            </div>
            <div class="cat-bar-bg">
              <div class="cat-bar-fill" style="width: ${pct}%;"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  const todasAlertas = productos.filter(p => p.stock_actual <= p.stock_minimo);
  const elAlertCount = document.getElementById('dash-alert-count');
  if (elAlertCount) elAlertCount.innerText = todasAlertas.length;

  const alertContainer = document.getElementById('dash-alerts');
  if (alertContainer) {
    if (todasAlertas.length === 0) {
      alertContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.8rem;">Sin alertas de reposición.</p>';
    } else {
      alertContainer.innerHTML = todasAlertas.map(p => `
        <div class="alert-item" style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0; border-bottom: 1px solid var(--sidebar-border); gap: 1rem;">
          <div>
            <div style="font-size:0.85rem; font-weight:700; color: var(--text-dark);">${p.nombre}</div>
            <div style="font-size:0.72rem; color:var(--text-muted);">Bodega Principal</div>
          </div>
          <div style="text-align:right; flex-shrink: 0;">
            <div style="font-size:0.85rem; color:#ef4444; font-weight:700;">${p.stock_actual} unidad</div>
            <div style="font-size:0.68rem; color:var(--text-muted);">Mín. ${p.stock_minimo}</div>
          </div>
        </div>
      `).join('');
    }
  }

  const dashMovContainer = document.getElementById('dash-movements');
  if (dashMovContainer) {
    if (!salidasRecientes || salidasRecientes.length === 0) {
      dashMovContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.8rem;">Sin entregas recientes a obras.</p>';
    } else {
      dashMovContainer.innerHTML = salidasRecientes.slice(0, 4).map(s => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 0.5rem 0; border-bottom:1px solid var(--sidebar-border)">
          <div>
            <span class="badge badge-out">SALIDA</span>
            <strong style="font-size:0.85rem; margin-left:0.3rem;">${s.productos?.nombre || 'Material'}</strong>
            <div style="font-size:0.72rem; color:var(--text-muted);">Entrega a: ${s.obra_destino || 'Obra'} (Recibe: ${s.solicitante || 'N/A'})</div>
          </div>
          <div style="text-align:right; flex-shrink:0;">
            <div style="font-size:0.85rem; font-weight:700; color:#ef4444;">-${s.cantidad} un.</div>
            <div style="font-size:0.68rem; color:var(--text-muted);">${new Date(s.fecha).toLocaleDateString()}</div>
          </div>
        </div>
      `).join('');
    }
  }
}

// ==========================================
// 4. MÓDULO MATERIALES / PRODUCTOS (EDICIÓN)
// ==========================================
function renderizarTablaInventario(productos) {
  const tbody = document.getElementById('inventory-table-body');
  if (!tbody) return;
  if (!productos || productos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No hay productos registrados.</td></tr>';
    return;
  }
  tbody.innerHTML = productos.map(p => `
    <tr>
      <td><b>${p.sku || ''}</b></td>
      <td>${p.nombre || ''}</td>
      <td>${p.categoria || ''}</td>
      <td style="color:${p.stock_actual <= p.stock_minimo ? 'red' : 'inherit'}; font-weight:bold;">${p.stock_actual ?? 0}</td>
      <td>${p.unidad_medida || '—'}</td>
      <td>$${Number(p.costo_unitario || 0).toFixed(2)}</td>
      <td><span style="font-size:0.8rem; color:var(--text-muted);">${p.updated_by || 'Sistema'}</span></td>
      <td>
        <button onclick="prepararEdicionProducto('${p.id}')" style="color:var(--primary-blue); border:none; background:none; cursor:pointer; font-weight:600; margin-right: 0.5rem;">Editar</button>
        <button onclick="eliminarProducto('${p.id}')" style="color:#ef4444; border:none; background:none; cursor:pointer; font-weight:600;">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

async function prepararEdicionProducto(id) {
  const { data: p, error } = await _supabase.from('productos').select('*').eq('id', id).single();
  if (error) return alert('Error al consultar producto: ' + error.message);

  productoEditandoId = id;
  document.getElementById('prod-sku').value = p.sku;
  document.getElementById('prod-nombre').value = p.nombre;
  document.getElementById('prod-categoria').value = p.categoria;
  document.getElementById('prod-stock').value = p.stock_actual;
  document.getElementById('prod-min').value = p.stock_minimo;
  document.getElementById('prod-costo').value = p.costo_unitario;

  openModal();
}

async function guardarProducto(e) {
  e.preventDefault();
  const prodData = {
    sku: document.getElementById('prod-sku').value,
    nombre: document.getElementById('prod-nombre').value,
    categoria: document.getElementById('prod-categoria').value,
    stock_actual: Number(document.getElementById('prod-stock').value),
    stock_minimo: Number(document.getElementById('prod-min').value),
    costo_unitario: Number(document.getElementById('prod-costo').value),
    updated_by: usuarioActual ? usuarioActual.nombre : 'Sistema'
  };

  let res;
  if (productoEditandoId) {
    res = await _supabase.from('productos').update(prodData).eq('id', productoEditandoId);
  } else {
    res = await _supabase.from('productos').insert([prodData]);
  }

  if (res.error) alert('Error al guardar producto: ' + res.error.message);
  else {
    productoEditandoId = null;
    closeModal();
    document.getElementById('product-form').reset();
    cargarDatos();
  }
}

async function eliminarProducto(id) {
  if (confirm('¿Eliminar producto?')) {
    const { error } = await _supabase.from('productos').delete().eq('id', id);
    if (error) alert('Error al eliminar: ' + error.message);
    else cargarDatos();
  }
}

// ==========================================
// POBLAR SELECTS (DESPLEGABLES DINÁMICOS Y FILTRADOS)
// ==========================================
function poblarSelectProductos(productos) {
  const selectMov = document.getElementById('mov-producto');
  const selectCompra = document.getElementById('compra-producto');
  const selectSalida = document.getElementById('salida-producto');
  const selectCesta = document.getElementById('cesta-producto-select');
  const selectReq = document.getElementById('req-producto-select');

  const prodOrdenados = [...productos].sort((a, b) => a.nombre.localeCompare(b.nombre));

  const optionsTodas = '<option value="">Seleccione Producto</option>' + 
    prodOrdenados.map(p => `<option value="${p.id}" data-sku="${p.sku}" data-nombre="${p.nombre}" data-cat="${p.categoria}">${p.nombre} (Stock: ${p.stock_actual})</option>`).join('');

  const prodDisponibles = prodOrdenados.filter(p => p.stock_actual > 0);
  const optionsSoloDisponibles = '<option value="">Seleccione Producto</option>' + 
    prodDisponibles.map(p => `<option value="${p.id}" data-sku="${p.sku}" data-nombre="${p.nombre}" data-cat="${p.categoria}" data-stock="${p.stock_actual}">${p.nombre} (Disponible: ${p.stock_actual})</option>`).join('');

  if (selectMov) selectMov.innerHTML = optionsTodas;
  if (selectCompra) selectCompra.innerHTML = optionsTodas;
  if (selectSalida) selectSalida.innerHTML = optionsSoloDisponibles;
  if (selectCesta) selectCesta.innerHTML = optionsSoloDisponibles;
  if (selectReq) selectReq.innerHTML = optionsSoloDisponibles;
}

function poblarSelectObras(obras) {
  const selectSalidaObra = document.getElementById('salida-obra');
  const selectCestaObra = document.getElementById('cesta-obra');
  const selectReqObra = document.getElementById('req-obra');

  const obrasOrdenadas = [...obras].sort((a, b) => {
    const nomA = a.direccion || a.nombre || '';
    const nomB = b.direccion || b.nombre || '';
    return nomA.localeCompare(nomB);
  });

  const options = '<option value="">Seleccione Obra</option>' + 
    obrasOrdenadas.map(o => `<option value="${o.direccion || o.nombre}">${o.direccion || o.nombre} ${o.lote && o.lote !== 'N/A' ? ' (' + o.lote + ')' : ''}</option>`).join('');

  if (selectSalidaObra) selectSalidaObra.innerHTML = options;
  if (selectCestaObra) selectCestaObra.innerHTML = options;
  if (selectReqObra) selectReqObra.innerHTML = options;
}

function poblarSelectContratistas(contratistas) {
  const selectSalidaCnt = document.getElementById('salida-solicitante');
  const selectCestaCnt = document.getElementById('cesta-contratista');
  const selectReqCnt = document.getElementById('req-contratista');

  const cntOrdenados = [...contratistas].sort((a, b) => (a.first_name || '').localeCompare(b.first_name || ''));

  const options = '<option value="">Seleccione Contratista</option>' + 
    cntOrdenados.map(c => {
      const nombreCompleto = `${c.first_name || ''} ${c.middle_name || ''} ${c.last_name || ''}`.replace(/\s+/g, ' ').trim();
      return `<option value="${nombreCompleto}">${nombreCompleto} ${c.phone ? ' - ' + c.phone : ''}</option>`;
    }).join('');

  if (selectSalidaCnt) selectSalidaCnt.innerHTML = options;
  if (selectCestaCnt) selectCestaCnt.innerHTML = options;
  if (selectReqCnt) selectReqCnt.innerHTML = options;
}

function poblarSelectProveedores(proveedores) {
  const selectCompraProv = document.getElementById('compra-proveedor');
  if (!selectCompraProv) return;

  const provOrdenados = [...proveedores].sort((a, b) => (a.nombre_empresa || '').localeCompare(b.nombre_empresa || ''));

  if (selectCompraProv.tagName === 'SELECT') {
    const options = '<option value="">Seleccione Proveedor</option>' + 
      provOrdenados.map(p => `<option value="${p.nombre_empresa}">${p.nombre_empresa}</option>`).join('');
    selectCompraProv.innerHTML = options;
  }
}

// ==========================================
// 5. ENTRADAS / COMPRAS
// ==========================================
// Helpers financieros. Los cálculos se realizan en centavos para evitar errores de coma flotante.
function dineroTax(centavos) {
  return `$${(centavos / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function centsTax(valor) {
  return Math.round((Number(valor) || 0) * 100);
}

function fechaLocalISO() {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

function inicializarControlesTaxes() {
  const fecha = document.getElementById('compra-fecha');
  const ciclo = document.getElementById('compra-ciclo-tax');
  const filtro = document.getElementById('tax-ciclo-filtro');
  const hoy = fechaLocalISO();
  if (fecha) fecha.value = hoy;
  if (ciclo) ciclo.value = hoy.slice(0, 7);
  if (filtro) filtro.value = hoy.slice(0, 7);
  actualizarModoTax();
}

function sincronizarCicloTax() {
  const fecha = document.getElementById('compra-fecha')?.value;
  const ciclo = document.getElementById('compra-ciclo-tax');
  if (fecha && ciclo) ciclo.value = fecha.slice(0, 7);
}

function actualizarModoTax() {
  const modo = document.getElementById('compra-tax-modo')?.value || 'PORCENTAJE';
  const porcentaje = document.getElementById('compra-tax-porcentaje');
  const monto = document.getElementById('compra-tax-monto');
  if (porcentaje) porcentaje.disabled = modo !== 'PORCENTAJE';
  if (monto) monto.disabled = modo !== 'MONTO';
  calcularTotalCompra();
}

function calcularDesgloseCompra(cantidad, costoUnitario, modo, porcentaje, taxFijo) {
  const subtotal = Math.round(cantidad * centsTax(costoUnitario));
  const impuestos = modo === 'MONTO'
    ? centsTax(taxFijo)
    : Math.round(subtotal * (porcentaje / 100));
  return { subtotal, impuestos, total: subtotal + impuestos };
}

function obtenerDesgloseFormularioCompra() {
  const cantidad = Number(document.getElementById('compra-cantidad').value) || 0;
  const costo = Number(document.getElementById('compra-costo').value) || 0;
  const modo = document.getElementById('compra-tax-modo')?.value || 'PORCENTAJE';
  const porcentaje = Number(document.getElementById('compra-tax-porcentaje')?.value) || 0;
  const monto = Number(document.getElementById('compra-tax-monto')?.value) || 0;
  return calcularDesgloseCompra(cantidad, costo, modo, porcentaje, monto);
}

function calcularTotalCompra() {
  const desglose = obtenerDesgloseFormularioCompra();
  const subtotalEl = document.getElementById('compra-subtotal-display');
  const taxesEl = document.getElementById('compra-tax-display');
  const totalEl = document.getElementById('compra-total-display');
  if (subtotalEl) subtotalEl.innerText = dineroTax(desglose.subtotal);
  if (taxesEl) taxesEl.innerText = dineroTax(desglose.impuestos);
  if (totalEl) totalEl.innerText = dineroTax(desglose.total);
}

async function registrarCompra(e) {
  e.preventDefault();

  const prodId = document.getElementById('compra-producto').value;
  const proveedor = document.getElementById('compra-proveedor').value;
  const factura = document.getElementById('compra-factura').value.trim();
  const cantidad = Number(document.getElementById('compra-cantidad').value);
  const costoUnitario = Number(document.getElementById('compra-costo').value);
  const estadoPago = document.getElementById('compra-estado-pago').value;
  const codigoLote = document.getElementById('compra-lote').value;
  const vencProd = document.getElementById('compra-venc-prod').value || null;
  const notas = document.getElementById('compra-notas').value;
  const fechaCompra = document.getElementById('compra-fecha').value;
  const ciclo = document.getElementById('compra-ciclo-tax').value;
  const modoTax = document.getElementById('compra-tax-modo').value;
  const porcentajeTax = Number(document.getElementById('compra-tax-porcentaje').value) || 0;
  const montoTax = Number(document.getElementById('compra-tax-monto').value) || 0;

  if (!prodId || !proveedor || !factura || !Number.isInteger(cantidad) || cantidad <= 0 ||
      !Number.isFinite(costoUnitario) || costoUnitario < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(fechaCompra) ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(ciclo)) {
    return alert('Complete la compra, su fecha y el ciclo contable con datos válidos.');
  }
  if (modoTax === 'PORCENTAJE' && (!Number.isFinite(porcentajeTax) || porcentajeTax < 0 || porcentajeTax > 100)) {
    return alert('El porcentaje de Taxes debe estar entre 0% y 100%.');
  }
  if (modoTax === 'MONTO' && (!Number.isFinite(montoTax) || montoTax < 0)) {
    return alert('El monto de Taxes no puede ser negativo.');
  }

  const valores = calcularDesgloseCompra(cantidad, costoUnitario, modoTax, porcentajeTax, montoTax);
  const total = valores.subtotal / 100; // Columna original conservada: total ANTES de impuestos.
  const importeTax = valores.impuestos / 100;
  const totalConTax = valores.total / 100;

  const { data: prod, error: errProd } = await _supabase.from('productos').select('stock_actual').eq('id', prodId).single();
  if (errProd) return alert('Error al consultar el producto seleccionado: ' + errProd.message);

  const nuevoStock = Number(prod.stock_actual) + cantidad;
  const autor = usuarioActual ? usuarioActual.nombre : 'Sistema';
  const { error: errCompra } = await _supabase.from('compras').insert([{
    producto_id: prodId,
    proveedor,
    factura,
    cantidad,
    costo_unitario: costoUnitario,
    total,
    estado_pago: estadoPago,
    codigo_lote: codigoLote,
    vencimiento_producto: vencProd,
    notas,
    fecha_compra: fechaCompra,
    tax_tipo: modoTax,
    tax_porcentaje: modoTax === 'PORCENTAJE' ? porcentajeTax : 0,
    tax_monto: importeTax,
    total_con_tax: totalConTax,
    tax_ciclo: ciclo,
    tax_estado: 'PENDIENTE', // Nunca marcar como declarado automáticamente.
    updated_by: autor
  }]);

  if (errCompra) return alert('Error al registrar la compra: ' + errCompra.message + '\nCompruebe que ya ejecutó la migración SQL de Taxes.');

  // Se conserva la secuencia previa de Entrada + actualización de producto.
  // Si ocurre un fallo parcial NO pedir al usuario repetir la compra: podría duplicarse.
  const { error: errMovimiento } = await _supabase.from('movimientos').insert([{
    producto_id: prodId,
    tipo: 'ENTRADA',
    cantidad,
    concepto: `Compra Factura: ${factura} (${proveedor})`,
    updated_by: autor
  }]);

  const { error: errStock } = await _supabase.from('productos').update({
    stock_actual: nuevoStock,
    costo_unitario: costoUnitario,
    updated_by: autor
  }).eq('id', prodId);

  if (errMovimiento || errStock) {
    alert('ATENCIÓN: La compra fue registrada, pero falló un paso posterior de inventario. No vuelva a guardarla; solicite una revisión administrativa. ' +
      [errMovimiento?.message, errStock?.message].filter(Boolean).join(' | '));
    cargarDatos();
    return;
  }

  alert('¡Compra registrada con éxito! El impuesto quedó pendiente de reporte contable.');
  document.getElementById('purchase-form').reset();
  inicializarControlesTaxes();
  cargarDatos();
}

// Evita incorporar texto de proveedores o facturas como HTML ejecutable en la tabla.
function escaparHTMLCompra(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function compraFechaTexto(c) {
  const fecha = c.fecha_compra || (c.fecha ? c.fecha.slice(0, 10) : '');
  if (!fecha) return 'Sin fecha';
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}/${mes}/${anio}`;
}

function comprasFiltradasPorCiclo() {
  const ciclo = document.getElementById('tax-ciclo-filtro')?.value || '';
  return ciclo ? comprasContabilidad.filter(c => c.tax_ciclo === ciclo) : comprasContabilidad;
}

async function cargarHistorialCompras() {
  const tbody = document.getElementById('purchases-table-body');
  if (!tbody) return;
  const pagina = 500;
  const acumuladas = [];
  let errorCarga = null;
  // Paginación explícita: Supabase limita el número de filas por respuesta.
  for (let desde = 0; ; desde += pagina) {
    const { data, error } = await _supabase.from('compras')
      .select('*, productos(nombre)')
      .order('fecha', { ascending: false })
      .range(desde, desde + pagina - 1);
    if (error) { errorCarga = error; break; }
    acumuladas.push(...(data || []));
    if (!data || data.length < pagina) break;
  }
  if (errorCarga) {
    console.error('Error cargando compras:', errorCarga);
    tbody.innerHTML = '<tr><td colspan="15" style="text-align:center;">Error al cargar compras. Verifique la migración de Taxes y permisos en Supabase.</td></tr>';
    return;
  }
  comprasContabilidad = acumuladas;
  renderizarControlTaxes();
}

function renderizarControlTaxes() {
  const tbody = document.getElementById('purchases-table-body');
  if (!tbody) return;
  const filtro = document.getElementById('tax-ciclo-filtro')?.value || '';
  const etiqueta = document.getElementById('tax-ciclo-etiqueta');
  if (etiqueta) etiqueta.innerText = filtro ? `Ciclo contable seleccionado: ${filtro}` : 'Mostrando todos los ciclos contables';
  const compras = comprasFiltradasPorCiclo();
  const sumas = compras.reduce((a, c) => {
    const subtotal = centsTax(c.total);
    const impuesto = centsTax(c.tax_monto);
    const totalConTax = c.total_con_tax == null ? subtotal + impuesto : centsTax(c.total_con_tax);
    a.subtotal += subtotal;
    a.impuestos += impuesto;
    a.total += totalConTax;
    if (c.tax_estado === 'REPORTADO') a.reportados += impuesto;
    else a.pendientes += impuesto;
    return a;
  }, { subtotal: 0, impuestos: 0, total: 0, reportados: 0, pendientes: 0 });
  for (const [id, importe] of Object.entries({
    'tax-kpi-subtotal': sumas.subtotal,
    'tax-kpi-registrados': sumas.impuestos,
    'tax-kpi-reportados': sumas.reportados,
    'tax-kpi-pendientes': sumas.pendientes,
    'tax-kpi-total': sumas.total
  })) {
    const el = document.getElementById(id);
    if (el) el.innerText = dineroTax(importe);
  }
  if (!compras.length) {
    tbody.innerHTML = '<tr><td colspan="15" style="text-align:center; padding:1.5rem;">No hay compras registradas para este ciclo.</td></tr>';
    return;
  }
  const puedeReportar = usuarioActual && ['ADMIN', 'SUPERADMIN'].includes(usuarioActual.rol);
  tbody.innerHTML = compras.map(c => {
    const importeTax = centsTax(c.tax_monto);
    const totalConTax = c.total_con_tax == null ? centsTax(c.total) + importeTax : centsTax(c.total_con_tax);
    const reportado = c.tax_estado === 'REPORTADO';
    const boton = puedeReportar
      ? `<div class="tax-row-actions">
           <button type="button" class="tax-action-btn" onclick="abrirEdicionTax('${escaparHTMLCompra(c.id)}')">Editar Taxes</button>
           ${importeTax > 0 ? `<button type="button" class="tax-action-btn" onclick="cambiarEstadoTax('${escaparHTMLCompra(c.id)}', '${reportado ? 'PENDIENTE' : 'REPORTADO'}')">${reportado ? 'Revertir a pendiente' : 'Marcar reportado'}</button>` : ''}
         </div>`
      : '<span class="tax-no-action">—</span>';
    return `
      <tr>
        <td>${compraFechaTexto(c)}</td>
        <td><b>${escaparHTMLCompra(c.factura)}</b></td>
        <td>${escaparHTMLCompra(c.productos?.nombre || 'General')}</td>
        <td>${escaparHTMLCompra(c.proveedor)}</td>
        <td>${escaparHTMLCompra(c.cantidad)}</td>
        <td>${dineroTax(centsTax(c.costo_unitario))}</td>
        <td>${dineroTax(centsTax(c.total))}</td>
        <td>${escaparHTMLCompra(c.tax_tipo === 'MONTO' ? 'Monto fijo' : `${Number(c.tax_porcentaje || 0)}%`)}</td>
        <td><strong>${dineroTax(importeTax)}</strong></td>
        <td><b>${dineroTax(totalConTax)}</b></td>
        <td>${escaparHTMLCompra(c.tax_ciclo || 'Sin ciclo')}</td>
        <td><span class="tax-status ${reportado ? 'reported' : 'pending'}">${importeTax === 0 ? 'Sin Tax' : reportado ? 'Reportado' : 'Pendiente'}</span></td>
        <td><span class="badge ${c.estado_pago === 'Pagada' ? 'badge-in' : 'badge-out'}">${escaparHTMLCompra(c.estado_pago)}</span></td>
        <td>${escaparHTMLCompra(c.updated_by || 'Sistema')}</td>
        <td>${boton}</td>
      </tr>`;
  }).join('');
}

function mostrarTodosLosCiclosTax() {
  const filtro = document.getElementById('tax-ciclo-filtro');
  if (filtro) filtro.value = '';
  renderizarControlTaxes();
}

// Edición contable independiente: útil para actualizar impuestos de compras históricas.
function abrirEdicionTax(compraId) {
  if (!usuarioActual || !['ADMIN', 'SUPERADMIN'].includes(usuarioActual.rol)) {
    return alert('Solo Administración puede editar los impuestos de una compra.');
  }
  const compra = comprasContabilidad.find(c => c.id === compraId);
  if (!compra) return alert('No se encontró la compra seleccionada.');
  compraEditandoTaxId = compraId;
  document.getElementById('tax-edit-factura-label').innerText = `Factura: ${compra.factura || 'Sin número'} • ${compra.proveedor || 'Sin proveedor'}`;
  document.getElementById('tax-edit-fecha').value = compra.fecha_compra || (compra.fecha || '').slice(0, 10);
  document.getElementById('tax-edit-ciclo').value = compra.tax_ciclo || (compra.fecha_compra || '').slice(0, 7);
  document.getElementById('tax-edit-modo').value = compra.tax_tipo || 'PORCENTAJE';
  document.getElementById('tax-edit-porcentaje').value = Number(compra.tax_porcentaje || 0);
  document.getElementById('tax-edit-monto').value = Number(compra.tax_monto || 0).toFixed(2);
  actualizarModoEdicionTax();
  document.getElementById('modal-editar-tax').classList.add('open');
  lucide.createIcons();
}

function cerrarEdicionTax() {
  document.getElementById('modal-editar-tax').classList.remove('open');
  compraEditandoTaxId = null;
}

function actualizarModoEdicionTax() {
  const modo = document.getElementById('tax-edit-modo').value;
  document.getElementById('tax-edit-porcentaje').disabled = modo !== 'PORCENTAJE';
  document.getElementById('tax-edit-monto').disabled = modo !== 'MONTO';
  calcularEdicionTax();
}

function calcularEdicionTax() {
  const compra = comprasContabilidad.find(c => c.id === compraEditandoTaxId);
  if (!compra) return;
  const desglose = calcularDesgloseCompra(
    Number(compra.cantidad), Number(compra.costo_unitario),
    document.getElementById('tax-edit-modo').value,
    Number(document.getElementById('tax-edit-porcentaje').value) || 0,
    Number(document.getElementById('tax-edit-monto').value) || 0
  );
  document.getElementById('tax-edit-total-display').innerText = dineroTax(desglose.total);
}

async function guardarEdicionTax(e) {
  e.preventDefault();
  if (!usuarioActual || !['ADMIN', 'SUPERADMIN'].includes(usuarioActual.rol)) {
    return alert('Solo Administración puede editar Taxes.');
  }
  const compra = comprasContabilidad.find(c => c.id === compraEditandoTaxId);
  if (!compra) return alert('Compra no encontrada.');
  const fecha = document.getElementById('tax-edit-fecha').value;
  const ciclo = document.getElementById('tax-edit-ciclo').value;
  const modo = document.getElementById('tax-edit-modo').value;
  const porcentaje = Number(document.getElementById('tax-edit-porcentaje').value) || 0;
  const monto = Number(document.getElementById('tax-edit-monto').value) || 0;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(ciclo) ||
      !['PORCENTAJE', 'MONTO'].includes(modo) ||
      (modo === 'PORCENTAJE' && (porcentaje < 0 || porcentaje > 100)) ||
      (modo === 'MONTO' && monto < 0)) {
    return alert('Revise la fecha, el ciclo contable y el impuesto indicado.');
  }
  const desglose = calcularDesgloseCompra(Number(compra.cantidad), Number(compra.costo_unitario), modo, porcentaje, monto);
  const importeTax = desglose.impuestos / 100;
  const taxActual = centsTax(compra.tax_monto);
  const cambioDatos = taxActual !== desglose.impuestos ||
    (compra.tax_ciclo || '') !== ciclo ||
    (compra.fecha_compra || '') !== fecha ||
    (compra.tax_tipo || 'PORCENTAJE') !== modo ||
    Number(compra.tax_porcentaje || 0) !== (modo === 'PORCENTAJE' ? porcentaje : 0);
  if (!cambioDatos) { cerrarEdicionTax(); return; }
  if (compra.tax_estado === 'REPORTADO' &&
      !confirm('Esta factura ya estaba marcada como REPORTADA. Editar los datos la regresará a PENDIENTE para nueva validación. ¿Continuar?')) return;

  const cambios = {
    fecha_compra: fecha,
    tax_ciclo: ciclo,
    tax_tipo: modo,
    tax_porcentaje: modo === 'PORCENTAJE' ? porcentaje : 0,
    tax_monto: importeTax,
    total_con_tax: desglose.total / 100,
    tax_estado: 'PENDIENTE',
    tax_reportado_fecha: null,
    tax_reportado_por: null,
    tax_actualizado_fecha: new Date().toISOString(),
    tax_actualizado_por: usuarioActual.nombre
  };
  const { data, error } = await _supabase.from('compras').update(cambios).eq('id', compra.id).select('id');
  if (error || !data?.length) {
    return alert('No se pudieron actualizar los impuestos: ' + (error?.message || 'Verifique permisos de Supabase.'));
  }
  cerrarEdicionTax();
  await cargarHistorialCompras();
}

async function cambiarEstadoTax(compraId, nuevoEstado) {
  if (!usuarioActual || !['ADMIN', 'SUPERADMIN'].includes(usuarioActual.rol)) {
    return alert('Solo los administradores pueden cambiar el estado de reporte contable.');
  }
  if (!['PENDIENTE', 'REPORTADO'].includes(nuevoEstado)) return;
  const compra = comprasContabilidad.find(c => c.id === compraId);
  if (!compra || centsTax(compra.tax_monto) <= 0) return alert('Esta compra no tiene impuestos registrados.');
  if (!confirm(`¿Desea marcar los impuestos de la factura ${compra.factura} como ${nuevoEstado.toLowerCase()}?`)) return;
  const nuevoValor = {
    tax_estado: nuevoEstado,
    tax_reportado_fecha: nuevoEstado === 'REPORTADO' ? new Date().toISOString() : null,
    tax_reportado_por: nuevoEstado === 'REPORTADO' ? usuarioActual.nombre : null
  };
  const { data, error } = await _supabase.from('compras').update(nuevoValor).eq('id', compraId).select('id');
  if (error || !data?.length) return alert('No se pudo actualizar el estado contable. Revise los permisos de Supabase. ' + (error?.message || ''));
  await cargarHistorialCompras();
}

function celdaCSVTax(valor) {
  let texto = String(valor ?? '');
  // Neutraliza fórmulas al abrir CSV en Excel u otra hoja de cálculo.
  if (/^[\s]*[=+@-]/.test(texto)) texto = "'" + texto;
  return '"' + texto.replace(/"/g, '""') + '"';
}

function exportarTaxesCSV() {
  const compras = comprasFiltradasPorCiclo();
  if (!compras.length) return alert('No hay compras para exportar en este ciclo.');
  const filas = [[
    'Fecha compra', 'Ciclo contable', 'Factura', 'Producto', 'Proveedor',
    'Cantidad', 'Costo unitario USD', 'Subtotal USD', 'Sales Tax porcentaje',
    'Tipo Tax', 'Taxes USD', 'Total con Taxes USD', 'Estado Tax',
    'Reportado fecha', 'Reportado por', 'Ultima edicion Taxes', 'Taxes editado por', 'Estado pago', 'Registrado por'
  ]];
  compras.forEach(c => filas.push([
    c.fecha_compra || (c.fecha || '').slice(0, 10), c.tax_ciclo || '', c.factura,
    c.productos?.nombre || '', c.proveedor, c.cantidad, c.costo_unitario,
    c.total, c.tax_porcentaje || 0, c.tax_tipo || 'PORCENTAJE',
    c.tax_monto || 0, c.total_con_tax ?? Number(c.total || 0) + Number(c.tax_monto || 0),
    c.tax_estado || 'PENDIENTE', c.tax_reportado_fecha || '',
    c.tax_reportado_por || '', c.tax_actualizado_fecha || '', c.tax_actualizado_por || '', c.estado_pago, c.updated_by || ''
  ]));
  const contenido = '\uFEFF' + filas.map(fila => fila.map(celdaCSVTax).join(',')).join('\r\n');
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  const ciclo = document.getElementById('tax-ciclo-filtro')?.value || 'todos-los-ciclos';
  enlace.href = url;
  enlace.download = `easy-solutions-taxes-${ciclo}.csv`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ==========================================
// 6. SALIDAS / ENTREGAS
// ==========================================
async function registrarSalidaModule(e) {
  e.preventDefault();

  const prodId = document.getElementById('salida-producto').value;
  const obra = document.getElementById('salida-obra').value;
  const solicitante = document.getElementById('salida-solicitante').value;
  const cantidad = Number(document.getElementById('salida-cantidad').value);
  const motivo = document.getElementById('salida-motivo').value;

  const { data: prod, error: errProd } = await _supabase.from('productos').select('stock_actual, nombre').eq('id', prodId).single();
  if (errProd) return alert('Error al consultar el producto seleccionado');

  if (prod.stock_actual < cantidad) {
    return alert(`Stock insuficiente. Intentas entregar ${cantidad} un., pero solo hay ${prod.stock_actual} un. disponibles.`);
  }

  const nuevoStock = prod.stock_actual - cantidad;

  const { error: errSalida } = await _supabase.from('salidas').insert([{
    producto_id: prodId,
    obra_destino: obra,
    solicitante,
    cantidad,
    motivo,
    updated_by: usuarioActual ? usuarioActual.nombre : 'Sistema'
  }]);

  if (errSalida) return alert('Error al registrar la salida: ' + errSalida.message);

  await _supabase.from('movimientos').insert([{
    producto_id: prodId,
    tipo: 'SALIDA',
    cantidad,
    concepto: `Entrega a: ${obra} (Recibe: ${solicitante})`,
    updated_by: usuarioActual ? usuarioActual.nombre : 'Sistema'
  }]);

  await _supabase.from('productos').update({ 
    stock_actual: nuevoStock,
    updated_by: usuarioActual ? usuarioActual.nombre : 'Sistema'
  }).eq('id', prodId);

  alert('¡Salida registrada con éxito!');
  document.getElementById('dispatch-form').reset();
  cargarDatos();
}

async function cargarHistorialSalidas() {
  const tbody = document.getElementById('dispatches-table-body');
  if (!tbody) return;

  const { data: salidas, error } = await _supabase
    .from('salidas')
    .select('*, productos(nombre)')
    .order('fecha', { ascending: false });

  if (error || !salidas || salidas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No hay salidas registradas.</td></tr>';
    return;
  }

  tbody.innerHTML = salidas.map(s => `
    <tr>
      <td>${new Date(s.fecha).toLocaleDateString()}</td>
      <td><b>${s.productos?.nombre || 'General'}</b></td>
      <td>${s.obra_destino}</td>
      <td>${s.solicitante}</td>
      <td style="color:#ef4444; font-weight:bold;">-${s.cantidad}</td>
      <td>${s.motivo}</td>
      <td><span style="font-size:0.8rem; color:var(--text-muted);">${s.updated_by || 'Sistema'}</span></td>
    </tr>
  `).join('');
}


// ==========================================
// 6A. DEVOLUCIONES PARCIALES AL INVENTARIO GENERAL
// Cada devolución se relaciona con una salida anterior.
// El RPC en PostgreSQL actualiza stock y Kardex de modo atómico.
// ==========================================
let devolucionOperacionPendiente = null;
let devolucionOrigenActual = null;
let devolucionMaximaActual = null;

function reiniciarOperacionDevolucion() {
  devolucionOperacionPendiente = null;
}

// Admite 0.5, 0,5, 1/2, 1/4, 3/4, 1 1/2. Máximo 3 decimales.
function convertirCantidadDevolucion(valor) {
  const texto = String(valor ?? '').trim().replace(',', '.');
  let numero;
  const mixto = texto.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  const fraccion = texto.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (mixto) {
    if (Number(mixto[3]) === 0) return NaN;
    numero = Number(mixto[1]) + Number(mixto[2]) / Number(mixto[3]);
  } else if (fraccion) {
    if (Number(fraccion[2]) === 0) return NaN;
    numero = Number(fraccion[1]) / Number(fraccion[2]);
  } else if (/^\d+(?:\.\d+)?$/.test(texto)) {
    numero = Number(texto);
  } else {
    return NaN;
  }
  if (!Number.isFinite(numero) || numero <= 0 || numero > 1000000 ||
      Math.abs(numero * 1000 - Math.round(numero * 1000)) > 1e-7) return NaN;
  return Math.round(numero * 1000) / 1000;
}

function establecerFraccionDevolucion(valor) {
  const el = document.getElementById('devolucion-cantidad');
  if (el) el.value = valor;
  reiniciarOperacionDevolucion();
  mostrarVistaCantidadDevolucion();
}

function mostrarVistaCantidadDevolucion() {
  const v = document.getElementById('devolucion-vista-cantidad');
  if (!v) return;
  const valor = document.getElementById('devolucion-cantidad')?.value;
  if (!valor) { v.textContent = ''; return; }
  const cantidad = convertirCantidadDevolucion(valor);
  if (!Number.isFinite(cantidad)) {
    v.textContent = 'Ingrese una cantidad positiva con máximo 3 decimales.';
    v.style.color = 'var(--danger)';
    return;
  }
  const unidad = devolucionOrigenActual?.productos?.unidad_medida || 'un.';
  v.style.color = 'var(--primary-blue)';
  v.textContent = `${valor} = ${cantidad.toLocaleString('en-US', {maximumFractionDigits:3})} ${unidad}`;
}

async function cargarSalidasParaDevolucion() {
  const sel = document.getElementById('devolucion-salida');
  if (!sel) return;
  const seleccionado = sel.value;
  const {data, error} = await _supabase.from('salidas')
    .select('id,fecha,cantidad,obra_destino,solicitante,producto_id,productos(sku,nombre,unidad_medida)')
    .order('fecha', {ascending: false}).limit(500);
  if (error) {
    sel.innerHTML = '<option value="">No se pudieron cargar las salidas</option>';
    console.error('Error consultando salidas para devoluciones:', error);
    return;
  }
  sel.innerHTML = '<option value="">Seleccione una entrega anterior</option>' +
    (data || []).map(s => {
      const fecha = s.fecha ? new Date(s.fecha).toLocaleDateString('es-NI') : '';
      const nombre = s.productos?.nombre || 'Material';
      const sku = s.productos?.sku || '';
      const um = s.productos?.unidad_medida || 'un.';
      const label = `${fecha} · ${sku} ${nombre} · ${s.cantidad} ${um} · ${s.obra_destino || 'Sin obra'}`;
      return `<option value="${s.id}">${escaparHTMLCompra(label)}</option>`;
    }).join('');
  if (seleccionado && (data || []).some(s => s.id === seleccionado)) {
    sel.value = seleccionado;
    actualizarDisponibilidadDevolucion();
  } else {
    devolucionOrigenActual = null;
    devolucionMaximaActual = null;
    const info = document.getElementById('devolucion-disponible');
    if (info) info.textContent = 'Seleccione una salida para consultar cuánto puede devolverse.';
  }
}

async function actualizarDisponibilidadDevolucion() {
  const salidaId = document.getElementById('devolucion-salida')?.value;
  const info = document.getElementById('devolucion-disponible');
  devolucionOrigenActual = null;
  devolucionMaximaActual = null;
  if (!salidaId) {
    if (info) info.textContent = 'Seleccione una salida para consultar cuánto puede devolverse.';
    mostrarVistaCantidadDevolucion();
    return;
  }
  if (info) info.textContent = 'Consultando la cantidad aún disponible para devolución…';
  const [resultadoSalida, resultadoDev] = await Promise.all([
    _supabase.from('salidas')
      .select('id,producto_id,fecha,cantidad,obra_destino,productos(nombre,sku,unidad_medida)')
      .eq('id', salidaId).single(),
    _supabase.from('movimientos').select('cantidad')
      .eq('salida_origen_id', salidaId).eq('tipo','ENTRADA')
  ]);
  if (document.getElementById('devolucion-salida')?.value !== salidaId) return;
  if (resultadoSalida.error || resultadoDev.error) {
    if (info) info.textContent = 'No fue posible consultar la disponibilidad. Verifique la migración SQL.';
    console.error('Consulta de devoluciones:', resultadoSalida.error || resultadoDev.error);
    return;
  }
  const salida = resultadoSalida.data;
  const devuelto = (resultadoDev.data || []).reduce((n, m) => n + Number(m.cantidad || 0), 0);
  const disponible = Math.max(0, Math.round((Number(salida.cantidad) - devuelto) * 1000) / 1000);
  devolucionOrigenActual = salida;
  devolucionMaximaActual = disponible;
  const um = salida.productos?.unidad_medida || 'un.';
  if (info) info.textContent = `Salida: ${salida.cantidad} ${um} · Devuelto: ${devuelto} ${um} · Disponible por devolver: ${disponible} ${um}`;
  mostrarVistaCantidadDevolucion();
}

async function registrarDevolucionParcial(e) {
  e.preventDefault();
  const sel = document.getElementById('devolucion-salida');
  const cantidad = convertirCantidadDevolucion(document.getElementById('devolucion-cantidad')?.value);
  const estado = document.getElementById('devolucion-estado')?.value;
  const observaciones = document.getElementById('devolucion-notas')?.value.trim() || '';
  const salidaId = sel?.value;
  if (!usuarioActual) return alert('Inicie sesión para registrar una devolución.');
  if (!salidaId || !devolucionOrigenActual || devolucionOrigenActual.id !== salidaId) {
    return alert('Seleccione una entrega válida y espere a que se consulte la disponibilidad.');
  }
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    return alert('Cantidad inválida. Utilice, por ejemplo, 0.5 o 1/2 (máximo 3 decimales).');
  }
  if (devolucionMaximaActual === null || cantidad > devolucionMaximaActual + 1e-9) {
    return alert('La devolución supera la cantidad pendiente de retornar en esta entrega.');
  }
  if (!['BUENO','PARCIAL_APROVECHABLE'].includes(estado)) {
    return alert('Seleccione la condición del material.');
  }
  const um = devolucionOrigenActual.productos?.unidad_medida || 'un.';
  const nombre = devolucionOrigenActual.productos?.nombre || 'material';
  if (!confirm(`¿Reintegrar ${cantidad} ${um} de ${nombre} al inventario general?\nLa operación quedará registrada en Kardex.`)) return;
  const boton = document.getElementById('btn-guardar-devolucion');
  if (boton?.disabled) return;
  if (boton) boton.disabled = true;
  if (!devolucionOperacionPendiente) devolucionOperacionPendiente = crypto.randomUUID();
  try {
    const {data, error} = await _supabase.rpc('registrar_devolucion_parcial', {
      p_salida_id: salidaId,
      p_cantidad: cantidad,
      p_estado: estado,
      p_observaciones: observaciones,
      p_registrado_por: usuarioActual.nombre || 'Sistema',
      p_operacion_id: devolucionOperacionPendiente
    });
    if (error) {
      alert('No se confirmó la devolución: ' + error.message + '\nSi la conexión falló, consulte el historial antes de registrar otra operación.');
      await actualizarDisponibilidadDevolucion();
      return;
    }
    const mensaje = `Devolución registrada: +${cantidad} ${um} al inventario general. Stock actual: ${Number(data?.stock_actual ?? 0).toLocaleString('en-US', {maximumFractionDigits:3})} ${um}.`;
    reiniciarOperacionDevolucion();
    document.getElementById('return-form').reset();
    devolucionOrigenActual = null;
    devolucionMaximaActual = null;
    await cargarDatos();
    alert(mensaje);
  } catch (err) {
    console.error('Error de devolución:',err);
    alert('No fue posible verificar el resultado. Revise el historial antes de intentar otra vez.');
  } finally {
    if (boton) boton.disabled = false;
  }
}

async function cargarHistorialDevoluciones() {
  const tbody = document.getElementById('returns-table-body');
  if (!tbody) return;
  const {data,error} = await _supabase.from('movimientos')
    .select('id,fecha,cantidad,concepto,updated_by,estado_devolucion,salida_origen_id,productos(sku,nombre,unidad_medida)')
    .not('salida_origen_id','is',null).eq('tipo','ENTRADA')
    .order('fecha',{ascending:false}).limit(100);
  if (error) {
    tbody.innerHTML='<tr><td colspan="7" style="text-align:center;">No se pudo cargar el historial. Revise la migración SQL.</td></tr>';
    console.error('Error leyendo devoluciones:', error);
    return;
  }
  if (!data?.length) {
    tbody.innerHTML='<tr><td colspan="7" style="text-align:center;">Todavía no hay devoluciones registradas.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(m => {
    const txt = String(m.concepto || '');
    const origen = txt.match(/Origen: (.*?) \| Condición:/)?.[1] || 'Ver Kardex';
    const estado = m.estado_devolucion === 'PARCIAL_APROVECHABLE' ? 'Parcial aprovechable' : 'Utilizable';
    const producto = `${m.productos?.sku || ''} · ${m.productos?.nombre || 'Material'}`;
    const um = m.productos?.unidad_medida || 'un.';
    return `<tr>
      <td>${m.fecha ? new Date(m.fecha).toLocaleString('es-NI') : '—'}</td>
      <td>${escaparHTMLCompra(producto)}</td>
      <td>${escaparHTMLCompra(origen)}</td>
      <td style="font-weight:700;color:#16a34a;">+${Number(m.cantidad).toLocaleString('en-US',{maximumFractionDigits:3})} ${escaparHTMLCompra(um)}</td>
      <td>${escaparHTMLCompra(estado)}</td>
      <td>${escaparHTMLCompra(m.updated_by || 'Sistema')}</td>
      <td style="font-size:0.8rem;">${escaparHTMLCompra(txt)}</td>
    </tr>`;
  }).join('');
}

// ==========================================
// 7. CESTA DE ENTREGA (CON CHECKBOX DE PREPARACIÓN)
// ==========================================
function agregarACesta() {
  const select = document.getElementById('cesta-producto-select');
  const prodId = select.value;
  const cantidad = Number(document.getElementById('cesta-cantidad-input').value) || 1;

  if (!prodId) return alert('Por favor seleccione un material de la lista.');

  const optionSelected = select.options[select.selectedIndex];
  const sku = optionSelected.getAttribute('data-sku');
  const nombre = optionSelected.getAttribute('data-nombre');
  const categoria = optionSelected.getAttribute('data-cat');

  const existe = cestaMateriales.find(item => item.id === prodId);
  if (existe) {
    existe.cantidad += cantidad;
  } else {
    cestaMateriales.push({ id: prodId, sku, nombre, categoria, cantidad, picked: false });
  }

  document.getElementById('cesta-cantidad-input').value = '';
  renderizarCesta(cestaNumeroOrdenActual);
}

function removerDeCesta(index) {
  cestaMateriales.splice(index, 1);
  renderizarCesta(cestaNumeroOrdenActual);
}

function toggleItemPicked(idx, isChecked) {
  if (cestaMateriales[idx]) {
    cestaMateriales[idx].picked = isChecked;
  }

  const row = document.getElementById(`cesta-row-${idx}`);
  if (row) {
    if (isChecked) {
      row.style.opacity = '0.5';
      row.style.textDecoration = 'line-through';
      row.style.backgroundColor = '#f1f5f9';
    } else {
      row.style.opacity = '1';
      row.style.textDecoration = 'none';
      row.style.backgroundColor = 'transparent';
    }
  }
}

function renderizarCesta(numeroOrden = cestaNumeroOrdenActual) {
  cestaNumeroOrdenActual = numeroOrden;
  const tbody = document.getElementById('cesta-items-body');
  const elNumOrden = document.getElementById('print-num-orden');

  if (elNumOrden) elNumOrden.innerText = numeroOrden;

  if (!tbody) return;

  if (cestaMateriales.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">La cesta está vacía. Seleccione materiales arriba.</td></tr>';
    return;
  }

  tbody.innerHTML = cestaMateriales.map((item, idx) => {
    const numDash = `${numeroOrden}-DASH-${String(idx + 1).padStart(2, '0')}`;
    const estaListo = item.picked || false;

    return `
      <tr id="cesta-row-${idx}" style="transition: all 0.2s ease; ${estaListo ? 'opacity:0.5; text-decoration:line-through; background-color:#f1f5f9;' : ''}">
        <td><b>${item.sku}</b></td>
        <td>${item.nombre}</td>
        <td>${item.categoria}</td>
        <td style="text-align:center; font-family:monospace; font-weight:bold; color:var(--primary-blue); font-size:0.85rem;">${numDash}</td>
        <td style="text-align:center; font-weight:bold; font-size:1rem;">${item.cantidad}</td>
        <td class="no-print" style="text-align:center;">
          <div style="display:inline-flex; align-items:center; gap:0.75rem; justify-content:center;">
            <button onclick="removerDeCesta(${idx})" style="color:#ef4444; border:none; background:none; cursor:pointer; font-weight:600;">Eliminar</button>
            <label title="Marcar como listo en bodega" style="display:inline-flex; align-items:center; cursor:pointer;">
              <input type="checkbox" onchange="toggleItemPicked(${idx}, this.checked)" ${estaListo ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--header-green);">
            </label>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function imprimirConduce() {
  if (cestaMateriales.length === 0) {
    return alert('Agregue al menos un material a la cesta antes de imprimir.');
  }

  const obra = document.getElementById('cesta-obra').value || 'N/A';
  const contratista = document.getElementById('cesta-contratista').value || 'N/A';
  const entregado = document.getElementById('cesta-entregado').value || (usuarioActual ? usuarioActual.nombre : 'N/A');
  const fechaActual = new Date().toLocaleDateString('es-NI');

  document.getElementById('print-obra').innerText = obra;
  document.getElementById('print-contratista').innerText = contratista;
  document.getElementById('print-entregado').innerText = entregado;
  document.getElementById('print-fecha').innerText = fechaActual;

  window.print();
}

// ==========================================
// 8. MÓDULO PROYECTOS / OBRAS (CON EDICIÓN)
// ==========================================
async function registrarObra(e) {
  e.preventDefault();
  const id = document.getElementById('obra-id') ? document.getElementById('obra-id').value : null;
  const direccion = document.getElementById('obra-direccion').value.trim();

  const obraData = {
    nombre: direccion,
    direccion: direccion,
    lote: document.getElementById('obra-lote').value.trim() || 'N/A',
    fase: document.getElementById('obra-fase').value.trim() || 'N/A',
    subdivision: document.getElementById('obra-subdivision').value.trim() || 'N/A',
    codigo_postal: document.getElementById('obra-zip').value.trim() || 'N/A',
    county: document.getElementById('obra-county').value.trim() || 'N/A',
    estado: 'Activa',
    updated_by: usuarioActual ? usuarioActual.nombre : 'Sistema'
  };

  let res;
  if (id) {
    res = await _supabase.from('obras').update(obraData).eq('id', id);
  } else {
    res = await _supabase.from('obras').insert([obraData]);
  }

  if (res.error) return alert('Error al guardar la obra: ' + res.error.message);

  alert(id ? '¡Obra actualizada con éxito!' : '¡Proyecto registrado con éxito!');
  document.getElementById('obra-form').reset();
  if (document.getElementById('obra-id')) document.getElementById('obra-id').value = '';
  cargarDatos();
}

function renderizarTablaObras(obras) {
  const tbody = document.getElementById('obras-table-body');
  if (!tbody) return;

  if (!obras || obras.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color: var(--text-muted);">No hay obras registradas.</td></tr>';
    return;
  }

  tbody.innerHTML = obras.map(o => `
    <tr>
      <td><b>${o.direccion || o.nombre || 'N/A'}</b></td>
      <td>${o.lote || 'N/A'}</td>
      <td>${o.fase || 'N/A'}</td>
      <td>${o.subdivision || 'N/A'}</td>
      <td>${o.codigo_postal || 'N/A'}</td>
      <td>${o.county || 'N/A'}</td>
      <td><span class="badge badge-in">${o.estado || 'Activa'}</span></td>
      <td><span style="font-size:0.8rem; color:var(--text-muted);">${o.updated_by || 'Sistema'}</span></td>
      <td>
        <button onclick="prepararEdicionObra('${o.id}')" style="color:var(--primary-blue); border:none; background:none; cursor:pointer; font-weight:600; margin-right: 0.5rem;">Editar</button>
        <button onclick="eliminarObra('${o.id}')" style="color:#ef4444; border:none; background:none; cursor:pointer; font-weight:600;">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

async function prepararEdicionObra(id) {
  const { data: o, error } = await _supabase.from('obras').select('*').eq('id', id).single();
  if (error) return alert('Error al consultar la obra');

  if (!document.getElementById('obra-id')) {
    const inputId = document.createElement('input');
    inputId.type = 'hidden';
    inputId.id = 'obra-id';
    document.getElementById('obra-form').appendChild(inputId);
  }

  document.getElementById('obra-id').value = o.id;
  document.getElementById('obra-direccion').value = o.direccion || '';
  document.getElementById('obra-lote').value = o.lote !== 'N/A' ? o.lote : '';
  document.getElementById('obra-fase').value = o.fase !== 'N/A' ? o.fase : '';
  document.getElementById('obra-subdivision').value = o.subdivision !== 'N/A' ? o.subdivision : '';
  document.getElementById('obra-zip').value = o.codigo_postal !== 'N/A' ? o.codigo_postal : '';
  document.getElementById('obra-county').value = o.county !== 'N/A' ? o.county : '';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function eliminarObra(id) {
  if (confirm('¿Desea eliminar esta obra del sistema?')) {
    const { error } = await _supabase.from('obras').delete().eq('id', id);
    if (error) alert('Error al eliminar obra: ' + error.message);
    else cargarDatos();
  }
}

// ==========================================
// 9. MÓDULO CONTRATISTAS (CON EDICIÓN)
// ==========================================
async function registrarContratista(e) {
  e.preventDefault();
  const id = document.getElementById('cnt-id') ? document.getElementById('cnt-id').value : null;

  const cntData = {
    first_name: document.getElementById('cnt-first-name').value.trim(),
    middle_name: document.getElementById('cnt-middle-name').value.trim(),
    last_name: document.getElementById('cnt-last-name').value.trim(),
    phone: document.getElementById('cnt-phone').value.trim(),
    email: document.getElementById('cnt-email').value.trim(),
    birth_date: document.getElementById('cnt-birth-date').value || null,
    ssn: document.getElementById('cnt-ssn').value.trim(),
    itin: document.getElementById('cnt-itin').value.trim(),
    address: document.getElementById('cnt-address').value.trim(),
    city: document.getElementById('cnt-city').value.trim(),
    state: document.getElementById('cnt-state').value,
    zip: document.getElementById('cnt-zip').value.trim(),
    status: document.getElementById('cnt-status').value,
    summary: document.getElementById('cnt-summary').value,
    notify_on_updates: document.getElementById('cnt-notify').value.trim(),
    updated_by: usuarioActual ? usuarioActual.nombre : 'Sistema'
  };

  let res;
  if (id) {
    res = await _supabase.from('contratistas').update(cntData).eq('id', id);
  } else {
    res = await _supabase.from('contratistas').insert([cntData]);
  }

  if (res.error) return alert('Error saving contractor: ' + res.error.message);

  alert(id ? '¡Contractor updated successfully!' : '¡Contractor saved successfully!');
  document.getElementById('contractor-form').reset();
  if (document.getElementById('cnt-id')) document.getElementById('cnt-id').value = '';
  cargarDatos();
}

async function cargarContratistas(contratistasList) {
  const tbody = document.getElementById('contractors-table-body');
  if (!tbody) return;

  let contratistas = contratistasList;
  if (!contratistas) {
    const { data, error } = await _supabase.from('contratistas').select('*');
    if (error) return console.error('Error al cargar contratistas:', error);
    contratistas = data;
  }

  if (!contratistas || contratistas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color: var(--text-muted);">No contractors registered.</td></tr>';
    return;
  }

  tbody.innerHTML = contratistas.map(c => `
    <tr>
      <td><b>${c.first_name || ''} ${c.middle_name || ''} ${c.last_name || ''}</b></td>
      <td>${c.phone || 'N/A'}</td>
      <td>${c.email || 'N/A'}</td>
      <td>${c.ssn || c.itin || 'N/A'}</td>
      <td>${c.address ? `${c.address},${c.city || ''}` : 'N/A'}</td>
      <td><span class="badge badge-in">${c.status || 'Active Contractor'}</span></td>
      <td><span style="font-size:0.8rem; color:var(--text-muted);">${c.updated_by || 'Sistema'}</span></td>
      <td>
        <button onclick="prepararEdicionContratista('${c.id}')" style="color:var(--primary-blue); border:none; background:none; cursor:pointer; font-weight:600; margin-right:0.5rem;">Edit</button>
        <button onclick="eliminarContratista('${c.id}')" style="color:#ef4444; border:none; background:none; cursor:pointer; font-weight:600;">Delete</button>
      </td>
    </tr>
  `).join('');
}

async function prepararEdicionContratista(id) {
  const { data: c, error } = await _supabase.from('contratistas').select('*').eq('id', id).single();
  if (error) return alert('Error fetching contractor');

  if (!document.getElementById('cnt-id')) {
    const inputId = document.createElement('input');
    inputId.type = 'hidden';
    inputId.id = 'cnt-id';
    document.getElementById('contractor-form').appendChild(inputId);
  }

  document.getElementById('cnt-id').value = c.id;
  document.getElementById('cnt-first-name').value = c.first_name || '';
  document.getElementById('cnt-middle-name').value = c.middle_name || '';
  document.getElementById('cnt-last-name').value = c.last_name || '';
  document.getElementById('cnt-phone').value = c.phone || '';
  document.getElementById('cnt-email').value = c.email || '';
  document.getElementById('cnt-birth-date').value = c.birth_date || '';
  document.getElementById('cnt-ssn').value = c.ssn || '';
  document.getElementById('cnt-itin').value = c.itin || '';
  document.getElementById('cnt-address').value = c.address || '';
  document.getElementById('cnt-city').value = c.city || '';
  document.getElementById('cnt-state').value = c.state || 'Texas';
  document.getElementById('cnt-zip').value = c.zip || '';
  document.getElementById('cnt-status').value = c.status || 'Active Contractor';
  document.getElementById('cnt-summary').value = c.summary || 'Currently Employed at Broadway';
  document.getElementById('cnt-notify').value = c.notify_on_updates || '';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function eliminarContratista(id) {
  if (confirm('Are you sure you want to delete this contractor?')) {
    const { error } = await _supabase.from('contratistas').delete().eq('id', id);
    if (error) alert('Error deleting: ' + error.message);
    else cargarDatos();
  }
}

// ==========================================
// 10. MÓDULO PROVEEDORES (CON EDICIÓN)
// ==========================================
async function registrarProveedor(e) {
  e.preventDefault();
  const id = document.getElementById('prov-id') ? document.getElementById('prov-id').value : null;

  const provData = {
    nombre_empresa: document.getElementById('prov-nombre').value.trim(),
    contacto_principal: document.getElementById('prov-contacto').value.trim(),
    tax_id: document.getElementById('prov-tax').value.trim(),
    telefono: document.getElementById('prov-telefono').value.trim(),
    email: document.getElementById('prov-email').value.trim(),
    direccion: document.getElementById('prov-direccion').value.trim(),
    categoria: document.getElementById('prov-categoria').value,
    updated_by: usuarioActual ? usuarioActual.nombre : 'Sistema'
  };

  let res;
  if (id) {
    res = await _supabase.from('proveedores').update(provData).eq('id', id);
  } else {
    res = await _supabase.from('proveedores').insert([provData]);
  }

  if (res.error) return alert('Error al guardar el proveedor: ' + res.error.message);

  alert(id ? '¡Proveedor actualizado con éxito!' : '¡Proveedor guardado con éxito!');
  document.getElementById('provider-form').reset();
  if (document.getElementById('prov-id')) document.getElementById('prov-id').value = '';
  cargarDatos();
}

function renderizarTablaProveedores(proveedores) {
  const tbody = document.getElementById('providers-table-body');
  if (!tbody) return;

  if (!proveedores || proveedores.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color: var(--text-muted);">No hay proveedores registrados.</td></tr>';
    return;
  }

  tbody.innerHTML = proveedores.map(p => `
    <tr>
      <td><b>${p.nombre_empresa}</b></td>
      <td>${p.contacto_principal || 'N/A'}</td>
      <td>${p.telefono || 'N/A'}</td>
      <td>${p.email || 'N/A'}</td>
      <td>${p.categoria || 'General'}</td>
      <td>${p.tax_id || 'N/A'}</td>
      <td><span style="font-size:0.8rem; color:var(--text-muted);">${p.updated_by || 'Sistema'}</span></td>
      <td>
        <button onclick="prepararEdicionProveedor('${p.id}')" style="color:var(--primary-blue); border:none; background:none; cursor:pointer; font-weight:600; margin-right:0.5rem;">Editar</button>
        <button onclick="eliminarProveedor('${p.id}')" style="color:#ef4444; border:none; background:none; cursor:pointer; font-weight:600;">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

async function prepararEdicionProveedor(id) {
  const { data: p, error } = await _supabase.from('proveedores').select('*').eq('id', id).single();
  if (error) return alert('Error al consultar proveedor');

  if (!document.getElementById('prov-id')) {
    const inputId = document.createElement('input');
    inputId.type = 'hidden';
    inputId.id = 'prov-id';
    document.getElementById('provider-form').appendChild(inputId);
  }

  document.getElementById('prov-id').value = p.id;
  document.getElementById('prov-nombre').value = p.nombre_empresa || '';
  document.getElementById('prov-contacto').value = p.contacto_principal || '';
  document.getElementById('prov-tax').value = p.tax_id || '';
  document.getElementById('prov-telefono').value = p.telefono || '';
  document.getElementById('prov-email').value = p.email || '';
  document.getElementById('prov-direccion').value = p.direccion || '';
  document.getElementById('prov-categoria').value = p.categoria || 'General';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function eliminarProveedor(id) {
  if (confirm('¿Desea eliminar este proveedor?')) {
    const { error } = await _supabase.from('proveedores').delete().eq('id', id);
    if (error) alert('Error al eliminar proveedor: ' + error.message);
    else cargarDatos();
  }
}

// ==========================================
// 11. MÓDULO REQUESTS / SOLICITUDES CON CONSECUTIVO SEGURO
// ==========================================
function agregarItemRequest() {
  const select = document.getElementById('req-producto-select');
  const prodId = select.value;
  const cantidadInput = document.getElementById('req-cantidad-input');
  const cantidad = Number(cantidadInput.value) || 0;

  if (!prodId) return alert('Por favor seleccione un producto de la lista.');
  if (cantidad <= 0) return alert('Ingrese una cantidad válida mayor a 0.');

  const option = select.options[select.selectedIndex];
  const stockDisponible = Number(option.getAttribute('data-stock')) || 0;
  const sku = option.getAttribute('data-sku');
  const nombre = option.getAttribute('data-nombre');
  const categoria = option.getAttribute('data-cat');

  const acumuladoPrevio = listaRequestTemp.filter(i => i.producto_id === prodId).reduce((sum, i) => sum + i.cantidad, 0);
  const totalSolicitado = acumuladoPrevio + cantidad;

  if (totalSolicitado > stockDisponible) {
    return alert(`Error: Stock insuficiente. Tienes ${stockDisponible} un. disponibles e intentas solicitar un total de ${totalSolicitado} un.`);
  }

  const existe = listaRequestTemp.find(item => item.producto_id === prodId);
  if (existe) {
    existe.cantidad += cantidad;
  } else {
    listaRequestTemp.push({ producto_id: prodId, sku, nombre, categoria, cantidad, stockDisponible });
  }

  cantidadInput.value = '';
  renderizarTablaRequestTemp();
}

function removerItemRequest(idx) {
  listaRequestTemp.splice(idx, 1);
  renderizarTablaRequestTemp();
}

function renderizarTablaRequestTemp() {
  const tbody = document.getElementById('req-items-body');
  if (!tbody) return;

  if (listaRequestTemp.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No hay materiales agregados a esta solicitud.</td></tr>';
    return;
  }

  tbody.innerHTML = listaRequestTemp.map((item, idx) => `
    <tr>
      <td><b>${item.sku}</b></td>
      <td>${item.nombre}</td>
      <td>${item.categoria}</td>
      <td style="text-align:center; font-weight:bold;">${item.cantidad}</td>
      <td style="text-align:center;">
        <button onclick="removerItemRequest(${idx})" style="color:#ef4444; border:none; background:none; cursor:pointer; font-weight:600;">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

async function guardarRequest() {
  const obra = document.getElementById('req-obra').value;
  const contratista = document.getElementById('req-contratista').value;
  const notas = document.getElementById('req-notas').value.trim();

  if (!obra || !contratista) return alert('Por favor seleccione la obra y el contratista.');
  if (listaRequestTemp.length === 0) return alert('Agregue al menos un material a la solicitud.');

  // Obtener todos los números de orden existentes para hallar el valor máximo real
  const { data: requestsBD } = await _supabase
    .from('requests')
    .select('numero_orden');

  let maxNum = 0;
  if (requestsBD && requestsBD.length > 0) {
    requestsBD.forEach(r => {
      if (r.numero_orden) {
        const num = parseInt(r.numero_orden.replace(/\D/g, ''), 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    });
  }

  const consecutivo = maxNum + 1;
  const numOrdenGenerado = `ORD-${String(consecutivo).padStart(4, '0')}`;

  const { data: req, error: errReq } = await _supabase.from('requests').insert([{
    numero_orden: numOrdenGenerado,
    obra_destino: obra,
    solicitante: contratista,
    notas,
    estado: 'Pendiente',
    estado_seguimiento: 'Aprobado / Listo en Bodega',
    created_by: usuarioActual ? usuarioActual.nombre : 'WFH User'
  }]).select().single();

  if (errReq) return alert('Error al crear la solicitud: ' + errReq.message);

  for (const item of listaRequestTemp) {
    await _supabase.from('request_items').insert([{
      request_id: req.id,
      producto_id: item.producto_id,
      cantidad: item.cantidad
    }]);

    const { data: prod } = await _supabase.from('productos').select('stock_actual').eq('id', item.producto_id).single();
    if (prod) {
      const nuevoStock = Math.max(0, prod.stock_actual - item.cantidad);
      await _supabase.from('productos').update({
        stock_actual: nuevoStock,
        updated_by: usuarioActual ? usuarioActual.nombre : 'WFH User'
      }).eq('id', item.producto_id);
    }
  }

  alert(`¡Request ${numOrdenGenerado} creado con éxito!`);
  listaRequestTemp = [];
  renderizarTablaRequestTemp();
  document.getElementById('req-obra').value = '';
  document.getElementById('req-contratista').value = '';
  document.getElementById('req-notas').value = '';
  cargarDatos();
}

async function cargarHistorialRequests() {
  const tbody = document.getElementById('requests-table-body');
  if (!tbody) return;

  const { data: requests, error } = await _supabase
    .from('requests')
    .select('*, request_items(*, productos(*))')
    .order('fecha', { ascending: false });

  if (error || !requests || requests.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-muted);">No hay solicitudes registradas.</td></tr>';
    return;
  }

  const superAdmins = [
    'axell@myeasysolutions.com',
    'arvin@myeasysolutions.com',
    'elias@myeasysolutions.com'
  ];

  const correoUsuario = (usuarioActual && usuarioActual.email) ? usuarioActual.email.trim().toLowerCase() : '';
  const esSuperAdmin = superAdmins.includes(correoUsuario) || (usuarioActual && usuarioActual.rol === 'SUPERADMIN');

  tbody.innerHTML = requests.map(r => {
    const numOrden = r.numero_orden || 'ORD-0000';
    const items = r.request_items || [];
    const resumenMateriales = items.map(i => `${i.productos?.nombre || 'Producto'}: <b>${i.cantidad} un.</b>`).join('<br>') || 'Sin ítems';
    
    const esPendiente = r.estado === 'Pendiente';
    const esCancelado = r.estado === 'Cancelado';

    let badgeClass = 'badge-in';
    if (esPendiente) badgeClass = 'badge-out';
    if (esCancelado) badgeClass = 'border-red';

    return `
      <tr>
        <td style="font-family:monospace; font-weight:bold; color:var(--primary-blue); font-size:0.9rem;">${numOrden}</td>
        <td>${new Date(r.fecha).toLocaleDateString()} ${new Date(r.fecha).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
        <td><b>${r.obra_destino || 'N/A'}</b></td>
        <td>${r.solicitante || 'N/A'}</td>
        <td style="font-size:0.82rem;">${resumenMateriales}</td>
        <td>
          <span class="badge ${badgeClass}" style="${esCancelado ? 'color:#ef4444; border:1px solid #ef4444; background:#fef2f2;' : ''}">${r.estado || 'Pendiente'}</span>
        </td>
        <td><span style="font-size:0.8rem; color:var(--text-muted);">${r.created_by || 'WFH'}</span></td>
        <td style="vertical-align: top;">
          <div style="display: flex; flex-direction: column; gap: 0.35rem; align-items: flex-start;">
            
            ${esPendiente ? `
              <div style="display: flex; gap: 0.4rem;">
                <button onclick="despacharRequest('${r.id}')" class="btn-primary" style="padding:0.35rem 0.65rem; font-size:0.75rem; background:var(--header-green);">
                  Despachar
                </button>
                <button onclick="cancelarRequest('${r.id}')" style="padding:0.35rem 0.65rem; font-size:0.75rem; background:#ef4444; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:600;">
                  Cancelar
                </button>
              </div>
            ` : ''}

            ${!esCancelado ? `
              <button onclick="cargarRequestEnCesta('${r.id}')" class="btn-secondary" style="padding:0.35rem 0.65rem; font-size:0.75rem; background:var(--primary-blue); color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:600; display:inline-flex; align-items:center; gap:0.3rem;">
                <i data-lucide="shopping-bag" style="width:12px; height:12px;"></i> Abrir en Cesta
              </button>
            ` : ''}

            ${esSuperAdmin ? `
              <button onclick="eliminarRequest('${r.id}')" style="padding:0.35rem 0.65rem; font-size:0.75rem; background:#dc2626; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:700; display:inline-flex; align-items:center; gap:0.3rem; margin-top:2px;">
                <i data-lucide="trash-2" style="width:12px; height:12px;"></i> Eliminar Orden
              </button>
            ` : ''}

            ${!esPendiente && !esCancelado ? `
              <div style="display: block; margin-top: 2px; font-size: 0.7rem; color: var(--text-muted); white-space: normal; line-height: 1.2;">
                Despachado por: <b>${r.despachado_por || 'Sistema'}</b>
              </div>
            ` : ''}

          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) {
    lucide.createIcons();
  }
}

// ELIMINACIÓN EXCLUSIVA PARA SUPERADMIN CON REINTEGRO AUTOMÁTICO AL INVENTARIO
async function eliminarRequest(requestId) {
  const superAdmins = [
    'axell@myeasysolutions.com',
    'arvin@myeasysolutions.com',
    'elias@myeasysolutions.com'
  ];

  const correoUsuario = (usuarioActual && usuarioActual.email) ? usuarioActual.email.trim().toLowerCase() : '';
  const esSuperAdmin = superAdmins.includes(correoUsuario) || (usuarioActual && usuarioActual.rol === 'SUPERADMIN');

  if (!esSuperAdmin) {
    return alert('Acceso denegado: Esta acción es exclusiva para SuperAdmins.');
  }

  const { data: req, error: errReq } = await _supabase
    .from('requests')
    .select('*, request_items(*)')
    .eq('id', requestId)
    .single();

  if (errReq || !req) return alert('Error al consultar la orden seleccionada.');

  const numOrden = req.numero_orden || 'esta orden';
  const confirmacion = confirm(`¿Estás seguro de ELIMINAR permanentemente la solicitud ${numOrden}?\n\nSi la orden estaba Completada o Pendiente, los materiales regresarán automáticamente al inventario.`);
  if (!confirmacion) return;

  if (req.estado !== 'Cancelado' && req.request_items) {
    for (const item of req.request_items) {
      const { data: prod } = await _supabase.from('productos').select('stock_actual').eq('id', item.producto_id).single();
      if (prod) {
        const nuevoStock = prod.stock_actual + item.cantidad;
        await _supabase.from('productos').update({
          stock_actual: nuevoStock,
          updated_by: `${usuarioActual.nombre} (SuperAdmin - Reintegro por Eliminación)`
        }).eq('id', item.producto_id);

        await _supabase.from('movimientos').insert([{
          producto_id: item.producto_id,
          tipo: 'ENTRADA',
          cantidad: item.cantidad,
          concepto: `Reintegro por eliminación de Orden ${numOrden}`,
          updated_by: usuarioActual.nombre
        }]);
      }
    }
  }

  await _supabase.from('request_items').delete().eq('request_id', requestId);
  const { error: errDelete } = await _supabase.from('requests').delete().eq('id', requestId);

  if (errDelete) {
    return alert('Error al eliminar la orden de la base de datos: ' + errDelete.message);
  }

  alert(`¡La solicitud ${numOrden} ha sido eliminada exitosamente y los inventarios han sido actualizados!`);
  cargarDatos();
}

// CARGAR DETALLES DEL REQUEST EN CESTA
async function cargarRequestEnCesta(requestId) {
  const { data: req, error } = await _supabase
    .from('requests')
    .select('*, request_items(*, productos(*))')
    .eq('id', requestId)
    .single();

  if (error || !req) return alert('Error al cargar los detalles del Request.');

  const selectObra = document.getElementById('cesta-obra');
  const selectCnt = document.getElementById('cesta-contratista');
  const inputEntregado = document.getElementById('cesta-entregado');

  if (selectObra) selectObra.value = req.obra_destino;
  if (selectCnt) selectCnt.value = req.solicitante;
  if (inputEntregado) inputEntregado.value = usuarioActual ? usuarioActual.nombre : (req.despachado_por || 'Despachador Bodega');

  cestaMateriales = (req.request_items || []).map(item => ({
    id: item.producto_id,
    sku: item.productos?.sku || 'N/A',
    nombre: item.productos?.nombre || 'Producto',
    categoria: item.productos?.categoria || 'General',
    cantidad: item.cantidad,
    picked: false
  }));

  const numOrden = req.numero_orden || 'ORD-0001';
  renderizarCesta(numOrden);
  switchTab('movil');

  setTimeout(() => {
    const printArea = document.querySelector('.print-area');
    if (printArea) printArea.scrollIntoView({ behavior: 'smooth' });
  }, 200);
}

// APROBACIÓN DEFINITIVA Y REGISTRO EN SALIDAS / KARDEX
async function despacharRequest(requestId) {
  if (!confirm('¿Confirmas que deseas despachar este Request y formalizar la entrega?')) return;

  const { data: req, error: errReq } = await _supabase
    .from('requests')
    .select('*, request_items(*, productos(stock_actual, nombre))')
    .eq('id', requestId)
    .single();

  if (errReq || !req) return alert('Error al cargar datos de la solicitud');

  for (const item of req.request_items) {
    await _supabase.from('salidas').insert([{
      producto_id: item.producto_id,
      obra_destino: req.obra_destino,
      solicitante: req.solicitante,
      cantidad: item.cantidad,
      motivo: `Request ${req.numero_orden || ''} Despachado (Solicitó: ${req.created_by})`,
      updated_by: usuarioActual ? usuarioActual.nombre : 'Gerente Obra'
    }]);

    await _supabase.from('movimientos').insert([{
      producto_id: item.producto_id,
      tipo: 'SALIDA',
      cantidad: item.cantidad,
      concepto: `Despacho Orden ${req.numero_orden || ''} a: ${req.obra_destino}`,
      updated_by: usuarioActual ? usuarioActual.nombre : 'Gerente Obra'
    }]);
  }

  await _supabase.from('requests').update({
    estado: 'Completado',
    estado_seguimiento: 'Aprobado / Listo en Bodega',
    despachado_por: usuarioActual ? usuarioActual.nombre : 'Gerente Obra',
    fecha_despacho: new Date()
  }).eq('id', requestId);

  alert(`¡Request ${req.numero_orden || ''} despachado con éxito!`);
  cargarDatos();
}

// CANCELACIÓN DE REQUEST Y DEVOLUCIÓN AUTOMÁTICA DE STOCK
async function cancelarRequest(requestId) {
  if (!confirm('¿Seguro que deseas cancelar este Request? Los materiales reservados regresarán automáticamente al inventario.')) return;

  const { data: req, error: errReq } = await _supabase
    .from('requests')
    .select('*, request_items(*)')
    .eq('id', requestId)
    .single();

  if (errReq || !req) return alert('Error al cargar la solicitud');

  for (const item of req.request_items) {
    const { data: prod } = await _supabase.from('productos').select('stock_actual').eq('id', item.producto_id).single();
    if (prod) {
      const stockDevuelto = prod.stock_actual + item.cantidad;
      await _supabase.from('productos').update({
        stock_actual: stockDevuelto,
        updated_by: usuarioActual ? usuarioActual.nombre : 'Sistema'
      }).eq('id', item.producto_id);
    }
  }

  await _supabase.from('requests').update({
    estado: 'Cancelado',
    despachado_por: usuarioActual ? usuarioActual.nombre : 'Sistema'
  }).eq('id', requestId);

  alert('Request cancelado. Los materiales se han devuelto al inventario.');
  cargarDatos();
}

// ==========================================
// 12. MÓDULO REQUEST TRACKING
// ==========================================
async function cargarRequestTracking() {
  const tbody = document.getElementById('tracking-table-body');
  if (!tbody) return;

  const { data: requests, error } = await _supabase
    .from('requests')
    .select('*, request_items(*, productos(nombre))')
    .eq('estado', 'Completado')
    .order('fecha_despacho', { ascending: false });

  if (error || !requests || requests.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-muted);">No hay solicitudes aprobadas para seguimiento.</td></tr>';
    actualizarKpisTracking([]);
    return;
  }

  actualizarKpisTracking(requests);

  tbody.innerHTML = requests.map(r => {
    const numOrden = r.numero_orden || 'ORD-0000';
    const resumenMateriales = (r.request_items || []).map(i => `${i.productos?.nombre || 'Prod'}: <b>${i.cantidad} un.</b>`).join('<br>') || 'Sin ítems';
    const estadoTrack = r.estado_seguimiento || 'Aprobado / Listo en Bodega';

    let colorBadge = '#3b82f6';
    if (estadoTrack === 'En Tránsito') colorBadge = '#f59e0b';
    if (estadoTrack === 'Entregado en Obra') colorBadge = '#10b981';
    if (estadoTrack === 'Completado / Firmado') colorBadge = '#059669';

    return `
      <tr>
        <td style="font-family:monospace; font-weight:bold; color:var(--primary-blue); font-size:0.9rem;">${numOrden}</td>
        <td>
          ${r.fecha_despacho ? new Date(r.fecha_despacho).toLocaleDateString() + ' ' + new Date(r.fecha_despacho).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : new Date(r.fecha).toLocaleDateString()}
        </td>
        <td><b>${r.obra_destino || 'N/A'}</b></td>
        <td>${r.solicitante || 'N/A'}</td>
        <td style="font-size:0.82rem;">${resumenMateriales}</td>
        <td><span style="font-size:0.8rem; color:var(--text-muted);">${r.despachado_por || 'Sistema'}</span></td>
        <td>
          <span class="badge" style="background: ${colorBadge}15; color: ${colorBadge}; border: 1px solid ${colorBadge}; font-weight:700;">
            ${estadoTrack}
          </span>
        </td>
        <td>
          <select onchange="actualizarEstadoTracking('${r.id}', this.value)" style="padding: 0.35rem; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.78rem; font-weight: 600; cursor: pointer; background: #fff;">
            <option value="Aprobado / Listo en Bodega" ${estadoTrack === 'Aprobado / Listo en Bodega' ? 'selected' : ''}>📦 Listo en Bodega</option>
            <option value="En Tránsito" ${estadoTrack === 'En Tránsito' ? 'selected' : ''}>🚚 En Tránsito</option>
            <option value="Entregado en Obra" ${estadoTrack === 'Entregado en Obra' ? 'selected' : ''}>📍 Entregado en Obra</option>
            <option value="Completado / Firmado" ${estadoTrack === 'Completado / Firmado' ? 'selected' : ''}>✅ Completado / Firmado</option>
          </select>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) {
    lucide.createIcons();
  }
}

function actualizarKpisTracking(requests) {
  const listos = requests.filter(r => (r.estado_seguimiento || 'Aprobado / Listo en Bodega') === 'Aprobado / Listo en Bodega').length;
  const transito = requests.filter(r => r.estado_seguimiento === 'En Tránsito').length;
  const entregados = requests.filter(r => r.estado_seguimiento === 'Entregado en Obra' || r.estado_seguimiento === 'Completado / Firmado').length;

  const kpiListos = document.getElementById('track-kpi-listos');
  const kpiTransito = document.getElementById('track-kpi-transito');
  const kpiEntregados = document.getElementById('track-kpi-entregados');

  if (kpiListos) kpiListos.innerText = listos;
  if (kpiTransito) kpiTransito.innerText = transito;
  if (kpiEntregados) kpiEntregados.innerText = entregados;
}

async function actualizarEstadoTracking(requestId, nuevoEstado) {
  const { error } = await _supabase
    .from('requests')
    .update({
      estado_seguimiento: nuevoEstado,
      tracking_updated_at: new Date()
    })
    .eq('id', requestId);

  if (error) {
    return alert('Error al actualizar el estado de seguimiento: ' + error.message);
  }

  cargarRequestTracking();
}

// ==========================================
// 13. MOVIMIENTOS Y NAVEGACIÓN TAB
// ==========================================
async function registrarMovimiento(e) {
  e.preventDefault();
  const prodId = document.getElementById('mov-producto').value;
  const tipo = document.getElementById('mov-tipo').value;
  const cantidad = Number(document.getElementById('mov-cantidad').value);
  const concepto = document.getElementById('mov-concepto').value;

  const { data: prod, error: errProd } = await _supabase.from('productos').select('stock_actual').eq('id', prodId).single();
  if (errProd) return alert('Error al consultar producto');

  const nuevoStock = tipo === 'ENTRADA' ? prod.stock_actual + cantidad : prod.stock_actual - cantidad;
  if (nuevoStock < 0) return alert('Error: Stock insuficiente para realizar esta salida');

  await _supabase.from('movimientos').insert([{ 
    producto_id: prodId, 
    tipo, 
    cantidad, 
    concepto,
    updated_by: usuarioActual ? usuarioActual.nombre : 'Sistema' 
  }]);
  await _supabase.from('productos').update({ 
    stock_actual: nuevoStock,
    updated_by: usuarioActual ? usuarioActual.nombre : 'Sistema' 
  }).eq('id', prodId);

  document.getElementById('movement-form').reset();
  cargarDatos();
}

async function renderizarMovimientos(movimientos) {
  const tbody = document.getElementById('movements-table-body');
  if (!tbody) return;
  if (movimientos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay movimientos registrados.</td></tr>';
    return;
  }
  tbody.innerHTML = movimientos.map(m => `
    <tr>
      <td>${new Date(m.fecha).toLocaleDateString()}</td>
      <td>${m.productos?.nombre || 'General'}</td>
      <td><span class="badge ${m.tipo === 'ENTRADA' ? 'badge-in' : 'badge-out'}">${m.tipo}</span></td>
      <td>${m.cantidad}</td>
      <td>${m.concepto}</td>
      <td><span style="font-size:0.8rem; color:var(--text-muted);">${m.updated_by || 'Sistema'}</span></td>
    </tr>
  `).join('');
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  
  const targetTab = document.getElementById(`tab-${tabId}`);
  if (targetTab) targetTab.classList.add('active');

  if (event && event.currentTarget) event.currentTarget.classList.add('active');
}

function openModal() { document.getElementById('modal-product').classList.add('open'); }
function closeModal() { 
  document.getElementById('modal-product').classList.remove('open'); 
  productoEditandoId = null;
  document.getElementById('product-form').reset();
}
