// CONFIGURACIÓN DE SUPABASE
const SUPABASE_URL = 'https://yuppkdlmjgneyzpuwupq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1cHBrZGxtamduZXl6cHV3dXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NTgyNzYsImV4cCI6MjEwNDQzNDI3Nn0.oJY0jks32BYBttOm5FYgBhAn-cIw5F6qDaXFh10No78';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let cestaMateriales = [];
let usuarioActual = null;

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

  const dispatchForm = document.getElementById('dispatch-form');
  if (dispatchForm) dispatchForm.addEventListener('submit', registrarSalidaModule);

  const obraForm = document.getElementById('obra-form');
  if (obraForm) obraForm.addEventListener('submit', registrarObra);
});

// ==========================================
// 1. AUTENTICACIÓN Y CONTROL DE ROLES
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
  
  const badge = document.getElementById('user-badge');
  badge.innerText = `${usuarioActual.nombre} (${usuarioActual.rol === 'ADMIN' ? 'Admin' : 'Gerente Obra'})`;

  aplicarPermisosRol();
  cargarDatos();
}

function aplicarPermisosRol() {
  const esAdmin = usuarioActual.rol === 'ADMIN';

  document.querySelectorAll('[data-role="ADMIN"]').forEach(el => {
    el.style.display = esAdmin ? '' : 'none';
  });

  const btnNuevoProd = document.getElementById('btn-nuevo-prod-header');
  if (btnNuevoProd) btnNuevoProd.style.display = esAdmin ? 'flex' : 'none';
}

// ==========================================
// 2. CARGA GENERAL DE DATOS
// ==========================================
async function cargarDatos() {
  const { data: productos, error: errProd } = await _supabase.from('productos').select('*');
  if (errProd) return console.error('Error cargando productos:', errProd);

  const { data: movimientos, error: errMov } = await _supabase
    .from('movimientos')
    .select('*, productos(nombre, costo_unitario)')
    .order('fecha', { ascending: false });

  if (errMov) console.error('Error cargando movimientos:', errMov);

  renderizarDashboard(productos || [], movimientos || []);
  renderizarTablaInventario(productos || []);
  poblarSelectProductos(productos || []);
  renderizarMovimientos(movimientos || []);
  cargarHistorialCompras();
  cargarHistorialSalidas();
  
  // Carga e impresión de la lista de obras y actualización del KPI
  cargarObras();
}

// ==========================================
// 3. DASHBOARD Y KPIs ($ USD)
// ==========================================
function renderizarDashboard(productos, movimientos) {
  document.getElementById('kpi-materiales').innerText = productos.length;

  const totalValor = productos.reduce((sum, p) => sum + (p.stock_actual * p.costo_unitario), 0);
  document.getElementById('kpi-valor').innerText = `$${totalValor.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const criticos = productos.filter(p => p.stock_actual <= p.stock_minimo && p.stock_actual > 0);
  document.getElementById('kpi-critico').innerText = criticos.length;

  const agotados = productos.filter(p => p.stock_actual === 0);
  document.getElementById('kpi-agotados').innerText = agotados.length;

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

      if (m.tipo === 'ENTRADA') totalEntradas += subtotal;
      if (m.tipo === 'SALIDA') totalSalidas += subtotal;
    }
  });

  document.getElementById('kpi-entradas').innerText = `$${totalEntradas.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  document.getElementById('kpi-salidas').innerText = `$${totalSalidas.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const categoriasMap = {};
  productos.forEach(p => {
    categoriasMap[p.categoria] = (categoriasMap[p.categoria] || 0) + p.stock_actual;
  });

  const numCategorias = Object.keys(categoriasMap).length;
  document.getElementById('kpi-cat-count').innerText = `${numCategorias} categorías`;

  const dashCatContainer = document.getElementById('dash-categories');
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

  const todasAlertas = productos.filter(p => p.stock_actual <= p.stock_minimo);
  document.getElementById('dash-alert-count').innerText = todasAlertas.length;

  const alertContainer = document.getElementById('dash-alerts');
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

  const dashMovContainer = document.getElementById('dash-movements');
  if (movimientos.length === 0) {
    dashMovContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.8rem;">Sin movimientos recientes.</p>';
  } else {
    dashMovContainer.innerHTML = movimientos.slice(0, 3).map(m => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding: 0.5rem 0; border-bottom:1px solid var(--sidebar-border)">
        <div>
          <span class="badge ${m.tipo === 'ENTRADA' ? 'badge-in' : 'badge-out'}">${m.tipo}</span>
          <strong style="font-size:0.85rem; margin-left:0.3rem;">${m.productos?.nombre || 'Producto'}</strong>
          <div style="font-size:0.72rem; color:var(--text-muted);">${m.concepto}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:0.85rem; font-weight:700;">${m.cantidad} un.</div>
          <div style="font-size:0.68rem; color:var(--text-muted);">${new Date(m.fecha).toLocaleDateString()}</div>
        </div>
      </div>
    `).join('');
  }

  const dashWorksContainer = document.getElementById('dash-works');
  dashWorksContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.8rem;">Sin obras activas registradas.</p>';
}

// ==========================================
// 4. TABLAS Y DESPLEGABLES
// ==========================================
function renderizarTablaInventario(productos) {
  const tbody = document.getElementById('inventory-table-body');
  if (!tbody) return;
  if (productos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay productos registrados.</td></tr>';
    return;
  }
  tbody.innerHTML = productos.map(p => `
    <tr>
      <td><b>${p.sku}</b></td>
      <td>${p.nombre}</td>
      <td>${p.categoria}</td>
      <td style="color:${p.stock_actual <= p.stock_minimo ? 'red' : 'inherit'}; font-weight:bold;">${p.stock_actual}</td>
      <td>$${p.costo_unitario.toFixed(2)}</td>
      <td><button onclick="eliminarProducto('${p.id}')" style="color:red; border:none; background:none; cursor:pointer;">Eliminar</button></td>
    </tr>
  `).join('');
}

function poblarSelectProductos(productos) {
  const selectMov = document.getElementById('mov-producto');
  const selectCompra = document.getElementById('compra-producto');
  const selectSalida = document.getElementById('salida-producto');
  const selectCesta = document.getElementById('cesta-producto-select');

  const options = '<option value="">Seleccione Producto</option>' + 
    productos.map(p => `<option value="${p.id}" data-sku="${p.sku}" data-nombre="${p.nombre}" data-cat="${p.categoria}">${p.nombre} (Stock: ${p.stock_actual})</option>`).join('');

  if (selectMov) selectMov.innerHTML = options;
  if (selectCompra) selectCompra.innerHTML = options;
  if (selectSalida) selectSalida.innerHTML = options;
  if (selectCesta) selectCesta.innerHTML = options;
}

// ==========================================
// 5. ENTRADAS / COMPRAS
// ==========================================
function calcularTotalCompra() {
  const cant = Number(document.getElementById('compra-cantidad').value) || 0;
  const costo = Number(document.getElementById('compra-costo').value) || 0;
  const total = cant * costo;
  
  const display = document.getElementById('compra-total-display');
  if (display) {
    display.innerText = `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

async function registrarCompra(e) {
  e.preventDefault();

  const prodId = document.getElementById('compra-producto').value;
  const proveedor = document.getElementById('compra-proveedor').value;
  const factura = document.getElementById('compra-factura').value;
  const cantidad = Number(document.getElementById('compra-cantidad').value);
  const costoUnitario = Number(document.getElementById('compra-costo').value);
  const total = cantidad * costoUnitario;
  const estadoPago = document.getElementById('compra-estado-pago').value;
  const codigoLote = document.getElementById('compra-lote').value;
  const vencProd = document.getElementById('compra-venc-prod').value || null;
  const notas = document.getElementById('compra-notas').value;

  const { data: prod, error: errProd } = await _supabase.from('productos').select('stock_actual').eq('id', prodId).single();
  if (errProd) return alert('Error al consultar el producto seleccionado');

  const nuevoStock = prod.stock_actual + cantidad;

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
    notas
  }]);

  if (errCompra) return alert('Error al registrar la compra: ' + errCompra.message);

  await _supabase.from('movimientos').insert([{
    producto_id: prodId,
    tipo: 'ENTRADA',
    cantidad,
    concepto: `Compra Factura: ${factura} (${proveedor})`
  }]);

  await _supabase.from('productos').update({ 
    stock_actual: nuevoStock,
    costo_unitario: costoUnitario 
  }).eq('id', prodId);

  alert('¡Compra registrada con éxito!');
  document.getElementById('purchase-form').reset();
  
  const display = document.getElementById('compra-total-display');
  if (display) display.innerText = '$0.00';

  cargarDatos();
}

async function cargarHistorialCompras() {
  const tbody = document.getElementById('purchases-table-body');
  if (!tbody) return;

  const { data: compras, error } = await _supabase
    .from('compras')
    .select('*, productos(nombre)')
    .order('fecha', { ascending: false });

  if (error || !compras || compras.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No hay compras registradas.</td></tr>';
    return;
  }

  tbody.innerHTML = compras.map(c => `
    <tr>
      <td>${new Date(c.fecha).toLocaleDateString()}</td>
      <td><b>${c.factura}</b></td>
      <td>${c.productos?.nombre || 'General'}</td>
      <td>${c.proveedor}</td>
      <td>${c.cantidad}</td>
      <td>$${Number(c.costo_unitario).toFixed(2)}</td>
      <td><b>$${Number(c.total).toFixed(2)}</b></td>
      <td><span class="badge ${c.estado_pago === 'Pagada' ? 'badge-in' : 'badge-out'}">${c.estado_pago}</span></td>
    </tr>
  `).join('');
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
    motivo
  }]);

  if (errSalida) return alert('Error al registrar la salida: ' + errSalida.message);

  await _supabase.from('movimientos').insert([{
    producto_id: prodId,
    tipo: 'SALIDA',
    cantidad,
    concepto: `Entrega a: ${obra} (Recibe: ${solicitante})`
  }]);

  await _supabase.from('productos').update({ stock_actual: nuevoStock }).eq('id', prodId);

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
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay salidas registradas.</td></tr>';
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
    </tr>
  `).join('');
}

// ==========================================
// 7. CESTA DE ENTREGA (CONDUCE)
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
    cestaMateriales.push({ id: prodId, sku, nombre, categoria, cantidad });
  }

  document.getElementById('cesta-cantidad-input').value = '';
  renderizarCesta();
}

function removerDeCesta(index) {
  cestaMateriales.splice(index, 1);
  renderizarCesta();
}

function renderizarCesta() {
  const tbody = document.getElementById('cesta-items-body');
  if (!tbody) return;

  if (cestaMateriales.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">La cesta está vacía. Seleccione materiales arriba.</td></tr>';
    return;
  }

  tbody.innerHTML = cestaMateriales.map((item, idx) => `
    <tr>
      <td><b>${item.sku}</b></td>
      <td>${item.nombre}</td>
      <td>${item.categoria}</td>
      <td style="text-align:center; font-weight:bold; font-size:1rem;">${item.cantidad}</td>
      <td class="no-print" style="text-align:center;">
        <button onclick="removerDeCesta(${idx})" style="color:#ef4444; border:none; background:none; cursor:pointer; font-weight:600;">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

function imprimirConduce() {
  if (cestaMateriales.length === 0) {
    return alert('Agregue al menos un material a la cesta antes de imprimir.');
  }

  const obra = document.getElementById('cesta-obra').value || 'N/A';
  const contratista = document.getElementById('cesta-contratista').value || 'N/A';
  const entregado = document.getElementById('cesta-entregado').value || 'N/A';
  const fechaActual = new Date().toLocaleDateString('es-NI');

  document.getElementById('print-obra').innerText = obra;
  document.getElementById('print-contratista').innerText = contratista;
  document.getElementById('print-entregado').innerText = entregado;
  document.getElementById('print-fecha').innerText = fechaActual;

  window.print();
}

// ==========================================
// 8. MÓDULO PROYECTOS / OBRAS (CORREGIDO)
// ==========================================
async function registrarObra(e) {
  e.preventDefault();

  const direccionInput = document.getElementById('obra-direccion');
  const loteInput = document.getElementById('obra-lote');
  const faseInput = document.getElementById('obra-fase');
  const subdivisionInput = document.getElementById('obra-subdivision');
  const zipInput = document.getElementById('obra-zip');
  const countyInput = document.getElementById('obra-county');

  if (!direccionInput) return;

  const direccion = direccionInput.value.trim();
  const lote = loteInput ? loteInput.value.trim() : '';
  const fase = faseInput ? faseInput.value.trim() : '';
  const subdivision = subdivisionInput ? subdivisionInput.value.trim() : '';
  const zip = zipInput ? zipInput.value.trim() : '';
  const county = countyInput ? countyInput.value.trim() : '';

  const nuevaObra = {
    nombre: direccion,
    direccion: direccion,
    lote: lote || 'N/A',
    fase: fase || 'N/A',
    subdivision: subdivision || 'N/A',
    codigo_postal: zip || 'N/A',
    county: county || 'N/A',
    estado: 'Activa'
  };

  const { error } = await _supabase.from('obras').insert([nuevaObra]);

  if (error) {
    return alert('Error al guardar la obra en Supabase: ' + error.message);
  }

  alert('¡Proyecto / Obra registrado con éxito!');
  document.getElementById('obra-form').reset();
  cargarDatos();
}

async function cargarObras() {
  const tbody = document.getElementById('obras-table-body');
  const dashWorksContainer = document.getElementById('dash-works');
  
  const { data: obras, error } = await _supabase
    .from('obras')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error al cargar obras desde Supabase:', error);
  }

  // 1. Actualizar el contador del KPI "OBRAS ACTIVAS"
  const kpiObras = document.getElementById('kpi-obras-count');
  if (kpiObras) {
    const activas = obras ? obras.filter(o => o.estado === 'Activa').length : 0;
    kpiObras.innerText = activas;
  }

  // 2. Renderizar la lista en el cuadro "Obras activas" del Dashboard
  if (dashWorksContainer) {
    const obrasActivas = obras ? obras.filter(o => o.estado === 'Activa') : [];
    if (obrasActivas.length === 0) {
      dashWorksContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.8rem;">Sin obras activas registradas.</p>';
    } else {
      dashWorksContainer.innerHTML = obrasActivas.slice(0, 5).map(o => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 0.5rem 0; border-bottom:1px solid var(--sidebar-border)">
          <div>
            <strong style="font-size:0.85rem; color:var(--text-dark);">${o.direccion || o.nombre}</strong>
            <div style="font-size:0.72rem; color:var(--text-muted);">${o.subdivision !== 'N/A' ? o.subdivision : ''} ${o.county !== 'N/A' ? '• ' + o.county : ''}</div>
          </div>
          <div>
            <span class="badge badge-in">${o.estado || 'Activa'}</span>
          </div>
        </div>
      `).join('');
    }
  }

  // 3. Renderizar la tabla principal en el módulo "Proyectos / Obras"
  if (!tbody) return;

  if (error || !obras || obras.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color: var(--text-muted);">No hay obras registradas.</td></tr>';
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
      <td>
        <button onclick="eliminarObra('${o.id}')" style="color:#ef4444; border:none; background:none; cursor:pointer; font-weight:600;">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

// ==========================================
// 9. OPERACIONES GENERALES Y MODAL
// ==========================================
async function guardarProducto(e) {
  e.preventDefault();
  const nuevoProd = {
    sku: document.getElementById('prod-sku').value,
    nombre: document.getElementById('prod-nombre').value,
    categoria: document.getElementById('prod-categoria').value,
    stock_actual: Number(document.getElementById('prod-stock').value),
    stock_minimo: Number(document.getElementById('prod-min').value),
    costo_unitario: Number(document.getElementById('prod-costo').value)
  };

  const { error } = await _supabase.from('productos').insert([nuevoProd]);
  if (error) alert('Error al guardar producto: ' + error.message);
  else {
    closeModal();
    document.getElementById('product-form').reset();
    cargarDatos();
  }
}

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

  await _supabase.from('movimientos').insert([{ producto_id: prodId, tipo, cantidad, concepto }]);
  await _supabase.from('productos').update({ stock_actual: nuevoStock }).eq('id', prodId);

  document.getElementById('movement-form').reset();
  cargarDatos();
}

async function renderizarMovimientos(movimientos) {
  const tbody = document.getElementById('movements-table-body');
  if (!tbody) return;
  if (movimientos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay movimientos registrados.</td></tr>';
    return;
  }
  tbody.innerHTML = movimientos.map(m => `
    <tr>
      <td>${new Date(m.fecha).toLocaleDateString()}</td>
      <td>${m.productos?.nombre || 'General'}</td>
      <td><span class="badge ${m.tipo === 'ENTRADA' ? 'badge-in' : 'badge-out'}">${m.tipo}</span></td>
      <td>${m.cantidad}</td>
      <td>${m.concepto}</td>
    </tr>
  `).join('');
}

async function eliminarProducto(id) {
  if (confirm('¿Eliminar producto?')) {
    const { error } = await _supabase.from('productos').delete().eq('id', id);
    if (error) alert('Error al eliminar: ' + error.message);
    else cargarDatos();
  }
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  
  const targetTab = document.getElementById(`tab-${tabId}`);
  if (targetTab) targetTab.classList.add('active');

  if (event && event.currentTarget) event.currentTarget.classList.add('active');
}

function openModal() { document.getElementById('modal-product').classList.add('open'); }
function closeModal() { document.getElementById('modal-product').classList.remove('open'); }

function openModal() { document.getElementById('modal-product').classList.add('open'); }
function closeModal() { document.getElementById('modal-product').classList.remove('open'); }
