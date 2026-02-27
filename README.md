# Drive-BackUp 0.94 🚀
### Motor de Respaldo Estructural y Preservación de Lógica para Google Drive

Este proyecto resuelve limitaciones críticas de infraestructura en el ecosistema de Google Drive, permitiendo la clonación recursiva de directorios y la salvaguarda de la lógica de negocio contenida en scripts vinculados.

---

## 🛠️ El Problema
* **Limitaciones de Copia Nativa**: Google Drive no permite copiar carpetas de forma recursiva manteniendo su jerarquía original.
* **Vulnerabilidad del Código**: El historial de versiones de Google no respalda de forma independiente el código de Apps Script. Drive-BackUp funciona como un sistema de recuperación de desastres para scripts.
* **Auditoría de Estado**: Evita los límites de 9 KB de memoria interna usando una base de datos externa (Logs) transparente y editable.

---

## ✨ Características Principales
* **Algoritmo DFS (Depth-First Search)**: Recreación exacta de estructuras de directorios.
* **Memoria Persistente en Logs**: Uso de la **Columna F** como base de datos de estado para evitar duplicados.
* **Dashboard UX**: Interfaz con tooltips técnicos y scorecards semafóricos.

<p align="center">
  <img src="./assets/dashboard.png" width="800" title="Dashboard Principal">
</p>

---

## ⚙️ Instrucciones de Configuración
0. **Copia**: realizá una copia de la plantilla oficial y sigue las instrucciones de configuración:
    👉 **[Hacer una copia del Template (Google Sheets)](https://docs.google.com/spreadsheets/d/TU_ID_AQUÍ/copy)**
1. **Destino**: Pegar el ID de la carpeta destino en la celda **B4**.
2. **Orígenes**: Listar los IDs de las carpetas a respaldar en el rango **B8:B14**.
3. **Filtros**: Seleccionar mediante los checkboxes si se desea incluir (**Solo**) o excluir (**Sin**) categorías específicas.
4. **Ejecución**: Presionar el botón **"Hacer BackUp"** para iniciar el proceso incremental.
5. **Mantenimiento**: Utilizar el botón **"Limpieza final"** para borrar directorios vacíos y actualizar métricas de volumen.

---

## 🚀 Hoja de Ruta (Roadmap)
- [ ] **Automatización One-Click**: Triggers automáticos desde el Dashboard.
- [ ] **Continuation Tokens**: Soporte para directorios masivos (+6 min).
- [ ] **Métricas de Transferencia**: Visualización de velocidad y volumen total.