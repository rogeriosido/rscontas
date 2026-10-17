from __future__ import annotations

import sqlite3
from pathlib import Path
import uuid
from werkzeug.security import generate_password_hash, check_password_hash

from flask import Flask, jsonify, request, send_file, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "data" / "rscontas.db"

app = Flask(__name__, static_folder=".", static_url_path="")
app.config["JSON_SORT_KEYS"] = False


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _get_user_by_token(token: str):
    if not token:
        return None
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT id, email, nome, celular, token, force_change FROM users WHERE token = ?", (token,)).fetchone()
        if not row:
            return None
        return {"id": row["id"], "email": row["email"], "nome": row["nome"], "celular": row["celular"], "force_change": bool(row["force_change"])}
    finally:
        conn.close()


def _get_token_from_request(req):
    auth = req.headers.get("Authorization") or req.headers.get("authorization")
    if auth and auth.startswith("Bearer "):
        return auth.split(" ", 1)[1].strip()
    token = req.headers.get("X-Auth-Token") or req.headers.get("x-auth-token")
    return token


def _require_user(req):
    token = _get_token_from_request(req)
    user = _get_user_by_token(token)
    return user


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
            user_id TEXT,
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
            user_id TEXT,
            PRIMARY KEY (grupo, valor, user_id)
        )
        """
    )
    # users table for auth
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE,
            celular TEXT,
            nome TEXT,
            password_hash TEXT,
            token TEXT,
            force_change INTEGER DEFAULT 0
        )
        """
    )
    conn.commit()
    conn.close()
    # create default admin user if no users exist
    conn = get_db_connection()
    try:
        cur = conn.execute("SELECT COUNT(1) as c FROM users").fetchone()
        if cur and cur["c"] == 0:
            admin_id = "admin"
            pwd_hash = generate_password_hash("admin")
            conn.execute(
                "INSERT OR IGNORE INTO users (id, email, celular, nome, password_hash, force_change) VALUES (?, ?, ?, ?, ?, ?)",
                (admin_id, "admin@local", "", "admin", pwd_hash, 1),
            )
            conn.commit()
    finally:
        conn.close()


def get_categorias_from_db(user_id=None):
    conn = get_db_connection()
    if user_id:
        rows = conn.execute("SELECT grupo, valor FROM categorias WHERE user_id = ? ORDER BY grupo, valor", (user_id,)).fetchall()
    else:
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


def get_contas_from_db(user_id=None):
    conn = get_db_connection()
    if user_id:
        rows = conn.execute(
            """
            SELECT id, titulo, tipo, centro, tipoDespesa, subtipo, valor, data, pago, obs, atualizadoEm
            FROM contas WHERE user_id = ?
            ORDER BY data DESC, atualizadoEm DESC
            """,
            (user_id,),
        ).fetchall()
    else:
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
    user = _require_user(request)
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    return jsonify(get_categorias_from_db(user_id=user["id"]))


@app.route("/api/categorias", methods=["POST"])
def api_add_categoria():
    data = request.get_json(silent=True) or {}
    grupo = str(data.get("grupo") or "").strip()
    valor = str(data.get("valor") or "").strip()

    if not grupo or not valor:
        return jsonify({"error": "Grupo e valor são obrigatórios"}), 400

    user = _require_user(request)
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db_connection()
    conn.execute(
        "INSERT OR IGNORE INTO categorias (grupo, valor, user_id) VALUES (?, ?, ?)",
        (grupo, valor, user["id"]),
    )
    conn.commit()
    conn.close()
    return jsonify(get_categorias_from_db(user_id=user["id"]))


@app.route("/api/categorias", methods=["DELETE"])
def api_delete_categoria():
    data = request.get_json(silent=True) or {}
    grupo = str(data.get("grupo") or "").strip()
    valor = str(data.get("valor") or "").strip()

    if not grupo or not valor:
        return jsonify({"error": "Grupo e valor são obrigatórios"}), 400

    user = _require_user(request)
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db_connection()
    conn.execute("DELETE FROM categorias WHERE grupo = ? AND valor = ? AND user_id = ?", (grupo, valor, user["id"]))
    conn.commit()
    conn.close()
    return jsonify(get_categorias_from_db(user_id=user["id"]))


@app.route("/api/contas", methods=["GET"])
def api_get_contas():
    user = _require_user(request)
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    return jsonify(get_contas_from_db(user_id=user["id"]))


@app.route("/api/contas", methods=["POST"])
def api_save_conta():
    payload = request.get_json(silent=True) or {}
    conta = normalize_conta(payload)

    if not conta or not conta["id"]:
        return jsonify({"error": "Dados da conta inválidos"}), 400

    user = _require_user(request)
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db_connection()
    conn.execute(
        """
        INSERT INTO contas (id, titulo, tipo, centro, tipoDespesa, subtipo, valor, user_id, data, pago, obs, atualizadoEm)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            user["id"],
            conta["data"],
            int(conta["pago"]),
            conta["obs"],
            conta["atualizadoEm"] or "",
        ),
    )
    conn.commit()
    conn.close()
    return jsonify(get_contas_from_db(user_id=user["id"]))


@app.route("/api/contas/<id>", methods=["DELETE"])
def api_delete_conta(id):
    user = _require_user(request)
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db_connection()
    conn.execute("DELETE FROM contas WHERE id = ? AND user_id = ?", (id, user["id"]))
    conn.commit()
    conn.close()
    return jsonify(get_contas_from_db(user_id=user["id"]))


@app.route("/api/contas/<id>", methods=["PUT"])
def api_update_conta(id):
    payload = request.get_json(silent=True) or {}
    conta = normalize_conta(payload)
    if not conta:
        return jsonify({"error": "Dados inválidos"}), 400

    user = _require_user(request)
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

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
        WHERE id = ? AND user_id = ?
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
            user["id"],
        ),
    )
    conn.commit()
    conn.close()
    return jsonify(get_contas_from_db(user_id=user["id"]))


@app.route("/<path:filename>")
def serve_static(filename):
    return send_from_directory(BASE_DIR, filename)


@app.route('/api/register', methods=['POST'])
def api_register():
    data = request.get_json(silent=True) or {}
    email = str(data.get('email') or '').strip()
    celular = str(data.get('celular') or '').strip()
    nome = str(data.get('nome') or '').strip()
    password = str(data.get('password') or '').strip()

    if not email or not password:
        return jsonify({'error': 'Email e senha são obrigatórios'}), 400

    user_id = str(uuid.uuid4())
    pwd_hash = generate_password_hash(password)

    conn = get_db_connection()
    try:
        conn.execute('INSERT INTO users (id, email, celular, nome, password_hash, force_change) VALUES (?, ?, ?, ?, ?, ?)', (user_id, email, celular, nome, pwd_hash, 0))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'error': 'Email já cadastrado'}), 400
    conn.close()

    # auto-login: create token
    token = str(uuid.uuid4())
    conn = get_db_connection()
    conn.execute('UPDATE users SET token = ? WHERE id = ?', (token, user_id))
    conn.commit()
    conn.close()

    return jsonify({'token': token, 'user': {'id': user_id, 'email': email, 'nome': nome}})


@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json(silent=True) or {}
    email = str(data.get('email') or '').strip()
    password = str(data.get('password') or '').strip()

    if not email or not password:
        return jsonify({'error': 'Email e senha são obrigatórios'}), 400

    conn = get_db_connection()
    row = conn.execute('SELECT id, password_hash, nome, celular, force_change FROM users WHERE email = ?', (email,)).fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Credenciais inválidas'}), 400

    if not check_password_hash(row['password_hash'], password):
        conn.close()
        return jsonify({'error': 'Credenciais inválidas'}), 400

    user_id = row['id']
    force_change = bool(row['force_change'])
    token = str(uuid.uuid4())
    conn.execute('UPDATE users SET token = ? WHERE id = ?', (token, user_id))
    conn.commit()
    conn.close()

    return jsonify({'token': token, 'user': {'id': user_id, 'email': email, 'nome': row['nome']}, 'force_change': force_change})


@app.route('/api/logout', methods=['POST'])
def api_logout():
    user = _require_user(request)
    if not user:
        return jsonify({'error': 'Unauthorized'}), 401
    conn = get_db_connection()
    conn.execute('UPDATE users SET token = NULL WHERE id = ?', (user['id'],))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/change_password', methods=['POST'])
def api_change_password():
    user = _require_user(request)
    if not user:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json(silent=True) or {}
    new_pwd = str(data.get('new_password') or '').strip()
    if not new_pwd:
        return jsonify({'error': 'Nova senha obrigatória'}), 400
    pwd_hash = generate_password_hash(new_pwd)
    conn = get_db_connection()
    conn.execute('UPDATE users SET password_hash = ?, force_change = 0 WHERE id = ?', (pwd_hash, user['id']))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.errorhandler(404)
def not_found(_):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Não encontrado"}), 404
    return send_file(BASE_DIR / "index.html")


init_db()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
