import { normalizeDateString, normalizeTimeString } from './dateUtils.js';

export function parseAllTrips(matrix) {
  let allTrips = [];
  if (!matrix || !Array.isArray(matrix) || matrix.length === 0) return allTrips;
  let currentTrip = { puntos: [], conductores: new Set() };
  let state = "METADATA";
  let colMap = {};

  for (let r = 0; r < matrix.length; r++) {
      let row = matrix[r];
      if (!row || row.length === 0) continue;

      if (state === "METADATA") {
          let foundOrden = false;
          for (let c = 0; c < row.length; c++) {
              let val = String(row[c] || "").trim().toUpperCase();
              if (val === "ORDEN") foundOrden = true;
              if (val) colMap[val] = c;
          }

          if (foundOrden) {
              state = "TABLE";
              continue;
          }

          for (let c = 0; c < row.length; c++) {
              let val = String(row[c] || "").trim().toUpperCase();
              if (["CODIGO VIAJE", "PLACA", "RUTA", "FECHA DEL VIAJE", "NUMERO INTERNO", "CODIGO DE RODAMIENTO"].includes(val)) {
                  let nextVal = "";
                  for(let nextC = c+1; nextC < row.length; nextC++) {
                      if(row[nextC] !== undefined && row[nextC] !== null && String(row[nextC]).trim() !== "") {
                          nextVal = String(row[nextC]).trim();
                          break;
                      }
                  }
                  if (val === "CODIGO VIAJE") currentTrip.viaje = nextVal;
                  if (val === "PLACA") currentTrip.placa = nextVal;
                  if (val === "RUTA") currentTrip.ruta = nextVal;
                  if (val === "FECHA DEL VIAJE") currentTrip.fecha = normalizeDateString(nextVal);
                  if (val === "NUMERO INTERNO") currentTrip.interno = nextVal;
                  if (val === "CODIGO DE RODAMIENTO") currentTrip.rodamiento = nextVal;
              }
          }
      } else if (state === "TABLE") {
          let ordenVal = row[colMap["ORDEN"]] ? String(row[colMap["ORDEN"]]).trim().toUpperCase() : "";

          if (ordenVal === "TOTAL") {
              currentTrip.totalDiferencia = parseFloat(String(row[colMap["DIFERENCIA"]]||"0").replace(',', '.'));
              currentTrip.totalDistancia = parseFloat(String(row[colMap["DISTANCIA"]]||"0").replace(',', '.'));
              
              if(currentTrip.viaje && currentTrip.puntos.length > 0) {
                  currentTrip.conductoresArray = Array.from(currentTrip.conductores);
                  allTrips.push(currentTrip);
              }
              
              currentTrip = { puntos: [], conductores: new Set() };
              colMap = {};
              state = "METADATA";
          } else if (ordenVal && !isNaN(parseInt(ordenVal))) {
              let diff = parseFloat(String(row[colMap["DIFERENCIA"]]||"0").replace(',', '.'));
              let dist = parseFloat(String(row[colMap["DISTANCIA"]]||"0").replace(',', '.'));
              let cond = row[colMap["CONDUCTOR"]] || "";
              
              let punto = {
                  orden: parseInt(ordenVal),
                  puesto: row[colMap["PUESTO DE CONTROL"]] || "",
                  hora_est: normalizeTimeString(row[colMap["HORA ESTIMADA DE LLEGADA"]]),
                  hora_real: normalizeTimeString(row[colMap["HORA REAL DE LLEGADA"]]),
                  conductor: cond,
                  diferencia: isNaN(diff) ? 0 : diff,
                  distancia: isNaN(dist) ? 0 : dist
              };
              currentTrip.puntos.push(punto);
              if(cond) currentTrip.conductores.add(cond);
          }
      }
  }

  if (currentTrip.viaje && currentTrip.puntos.length > 0) {
      currentTrip.conductoresArray = Array.from(currentTrip.conductores);
      allTrips.push(currentTrip);
  }

  return allTrips;
}
