from __future__ import annotations

import sqlite3
from pathlib import Path

from flask import Flask, jsonify, request, send_file, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "data" / "rscontas.db"

app = Flask(__name__, static_folder=".", static_url_path="")
app.config["JSON_SORT_KEYS"] = False


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = get_db_connection()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS contas (
            id TEXT PRIMARY KEY,
            titulo TEXT,
            tipo TEXT,
            centro TEXT,
            tipoDespesa TEXT,
            subtipo TEXT,
            valor REAL,
            data TEXT,
            pago INTEGER,
            obs TEXT,
            atualizadoEm TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS categorias (
            grupo TEXT,
            valor TEXT,
            PRIMARY KEY (grupo, valor)
        )
        """
    )
    conn.commit()
    conn.close()


def get_categorias_from_db():
    conn = get_db_connection()
    rows = conn.execute("SELECT grupo, valor FROM categorias ORDER BY grupo, valor").fetchall()
    conn.close()

    estrutura = {"centros": [], "tipos": [], "subtipos": []}
    for row in rows:
        if row["grupo"] == "centros":
            estrutura["centros"].append(row["valor"])
        elif row["grupo"] == "tipos":
            estrutura["tipos"].append(row["valor"])
        elif row["grupo"] == "subtipos":
            estrutura["subtipos"].append(row["valor"])
    return estrutura


def get_contas_from_db():
    conn = get_db_connection()
    rows = conn.execute(
        """
        SELECT id, titulo, tipo, centro, tipoDespesa, subtipo, valor, data, pago, obs, atualizadoEm
        FROM contas
        ORDER BY data DESC, atualizadoEm DESC
        """
    ).fetchall()
    conn.close()

    result = []
    for row in rows:
        result.append(
            {
                "id": row["id"],
                "titulo": row["titulo"],
                "tipo": row["tipo"],
                "centro": row["centro"],
                "tipoDespesa": row["tipoDespesa"],
                "subtipo": row["subtipo"],
                "valor": float(row["valor"] or 0),
                "data": row["data"],
                "pago": bool(row["pago"]),
                "obs": row["obs"],
                "atualizadoEm": row["atualizadoEm"],
            }
        )
    return result


def normalize_conta(payload):
    if not payload:
        return None

    conta = {
        "id": payload.get("id") or "",
        "titulo": payload.get("titulo") or "",
        "tipo": payload.get("tipo") or "P",
        "centro": payload.get("centro") or "",
        "tipoDespesa": payload.get("tipoDespesa") or "",
        "subtipo": payload.get("subtipo") or "",
        "valor": float(payload.get("valor") or 0),
        "data": payload.get("data") or "",
        "pago": bool(payload.get("pago")) ,
        "obs": payload.get("obs") or "",
        "atualizadoEm": payload.get("atualizadoEm") or "",
    }
    return conta


@app.get("/")
def index():
    return send_file(BASE_DIR / "index.html")


@app.route("/health")
def health():
    return jsonify({"ok": True, "db": "sqlite"})


@app.route("/api/categorias", methods=["GET"])
def api_get_categorias():
    return jsonify(get_categorias_from_db())


@app.route("/api/categorias", methods=["POST"])
def api_add_categoria():
    data = request.get_json(silent=True) or {}
    grupo = str(data.get("grupo") or "").strip()
    valor = str(data.get("valor") or "").strip()

    if not grupo or not valor:
        return jsonify({"error": "Grupo e valor são obrigatórios"}), 400

    conn = get_db_connection()
    conn.execute(
        "INSERT OR IGNORE INTO categorias (grupo, valor) VALUES (?, ?)",
        (grupo, valor),
    )
    conn.commit()
    conn.close()
    return jsonify(get_categorias_from_db())


@app.route("/api/categorias", methods=["DELETE"])
def api_delete_categoria():
    data = request.get_json(silent=True) or {}
    grupo = str(data.get("grupo") or "").strip()
    valor = str(data.get("valor") or "").strip()

    if not grupo or not valor:
        return jsonify({"error": "Grupo e valor são obrigatórios"}), 400

    conn = get_db_connection()
    conn.execute("DELETE FROM categorias WHERE grupo = ? AND valor = ?", (grupo, valor))
    conn.commit()
    conn.close()
    return jsonify(get_categorias_from_db())


@app.route("/api/contas", methods=["GET"])
def api_get_contas():
    return jsonify(get_contas_from_db())


@app.route("/api/contas", methods=["POST"])
def api_save_conta():
    payload = request.get_json(silent=True) or {}
    conta = normalize_conta(payload)

    if not conta or not conta["id"]:
        return jsonify({"error": "Dados da conta inválidos"}), 400

    conn = get_db_connection()
    conn.execute(
        """
        INSERT INTO contas (id, titulo, tipo, centro, tipoDespesa, subtipo, valor, data, pago, obs, atualizadoEm)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            titulo = excluded.titulo,
            tipo = excluded.tipo,
            centro = excluded.centro,
            tipoDespesa = excluded.tipoDespesa,
            subtipo = excluded.subtipo,
            valor = excluded.valor,
            data = excluded.data,
            pago = excluded.pago,
            obs = excluded.obs,
            atualizadoEm = excluded.atualizadoEm
        """,
        (
            conta["id"],
            conta["titulo"],
            conta["tipo"],
            conta["centro"],
            conta["tipoDespesa"],
            conta["subtipo"],
            conta["valor"],
            conta["data"],
            int(conta["pago"]),
            conta["obs"],
            conta["atualizadoEm"] or "",
        ),
    )
    conn.commit()
    conn.close()
    return jsonify(get_contas_from_db())


@app.route("/api/contas/<id>", methods=["DELETE"])
def api_delete_conta(id):
    conn = get_db_connection()
    conn.execute("DELETE FROM contas WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    return jsonify(get_contas_from_db())


@app.route("/api/contas/<id>", methods=["PUT"])
def api_update_conta(id):
    payload = request.get_json(silent=True) or {}
    conta = normalize_conta(payload)
    if not conta:
        return jsonify({"error": "Dados inválidos"}), 400

    conn = get_db_connection()
    conn.execute(
        """
        UPDATE contas SET
            titulo = ?,
            tipo = ?,
            centro = ?,
            tipoDespesa = ?,
            subtipo = ?,
            valor = ?,
            data = ?,
            pago = ?,
            obs = ?,
            atualizadoEm = ?
        WHERE id = ?
        """,
        (
            conta["titulo"],
            conta["tipo"],
            conta["centro"],
            conta["tipoDespesa"],
            conta["subtipo"],
            conta["valor"],
            conta["data"],
            int(conta["pago"]),
            conta["obs"],
            conta["atualizadoEm"] or "",
            id,
        ),
    )
    conn.commit()
    conn.close()
    return jsonify(get_contas_from_db())


@app.route("/<path:filename>")
def serve_static(filename):
    return send_from_directory(BASE_DIR, filename)


@app.errorhandler(404)
def not_found(_):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Não encontrado"}), 404
    return send_file(BASE_DIR / "index.html")


init_db()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
