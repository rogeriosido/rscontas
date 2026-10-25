from __future__ import annotations

import sqlite3
import calendar
from datetime import date, datetime
from io import BytesIO
from pathlib import Path
import re
import uuid
import xlrd
import xlwt
from werkzeug.security import generate_password_hash, check_password_hash

from flask import Flask, jsonify, request, send_file, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "data" / "rscontas.db"
VERSION_PATH = BASE_DIR / "VERSION"

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
            pagamento TEXT,
            parcela TEXT,
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
    # after creation, ensure legacy DBs get the new user_id column if missing
    # check contas
    cols = [r[1] for r in conn.execute("PRAGMA table_info('contas')").fetchall()]
    if 'user_id' not in cols:
        conn.execute("ALTER TABLE contas ADD COLUMN user_id TEXT")
        conn.execute("UPDATE contas SET user_id = ?", ("admin",))
    # add pagamento column for older DBs
    cols = [r[1] for r in conn.execute("PRAGMA table_info('contas')").fetchall()]
    if 'pagamento' not in cols:
        conn.execute("ALTER TABLE contas ADD COLUMN pagamento TEXT")
        conn.execute("UPDATE contas SET pagamento = ?", ("",))
    cols = [r[1] for r in conn.execute("PRAGMA table_info('contas')").fetchall()]
    if 'parcela' not in cols:
        conn.execute("ALTER TABLE contas ADD COLUMN parcela TEXT")
    # check categorias
    cols2 = [r[1] for r in conn.execute("PRAGMA table_info('categorias')").fetchall()]
    if 'user_id' not in cols2:
        conn.execute("ALTER TABLE categorias ADD COLUMN user_id TEXT")
        conn.execute("UPDATE categorias SET user_id = ?", ("admin",))
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
        elif row["grupo"] == "pagamentos":
            # allow additional group pagamentos
            if "pagamentos" not in estrutura:
                estrutura["pagamentos"] = []
            estrutura["pagamentos"].append(row["valor"])
    # ensure pagamentos key exists
    if "pagamentos" not in estrutura:
        estrutura["pagamentos"] = []
    return estrutura


def get_contas_from_db(user_id=None):
    conn = get_db_connection()
    if user_id:
        rows = conn.execute(
            """
            SELECT id, titulo, tipo, centro, tipoDespesa, subtipo, pagamento, parcela, valor, data, pago, obs, atualizadoEm
            FROM contas WHERE user_id = ?
            ORDER BY data DESC, atualizadoEm DESC
            """,
            (user_id,),
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT id, titulo, tipo, centro, tipoDespesa, subtipo, pagamento, parcela, valor, data, pago, obs, atualizadoEm
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
                "pagamento": row["pagamento"] if "pagamento" in row.keys() else "",
                "parcela": row["parcela"] if "parcela" in row.keys() else "",
                "valor": float(row["valor"] or 0),
                "data": row["data"],
                "pago": bool(row["pago"]),
                "obs": row["obs"],
                "atualizadoEm": row["atualizadoEm"],
            }
        )
    return result


def _xls_workbook(sheets):
    workbook = xlwt.Workbook(encoding="utf-8")
    for sheet_name, rows in sheets:
        sheet = workbook.add_sheet(sheet_name)
        for row_index, values in enumerate(rows):
            for col_index, value in enumerate(values):
                sheet.write(row_index, col_index, "" if value is None else value)
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def _valor_planilha(value):
    if isinstance(value, (int, float)):
        return float(value)
    texto = str(value or "").strip().replace("R$", "").replace(" ", "")
    if "," in texto and "." in texto:
        if texto.rfind(",") > texto.rfind("."):
            texto = texto.replace(".", "").replace(",", ".")
        else:
            texto = texto.replace(",", "")
    elif "," in texto:
        texto = texto.replace(".", "").replace(",", ".")
    return float(texto or 0)


def _data_planilha(value, datemode):
    if isinstance(value, (int, float)):
        return xlrd.xldate_as_datetime(value, datemode).date().isoformat()
    texto = str(value or "").strip()
    if re.fullmatch(r"\d{2}/\d{2}/\d{4}", texto):
        dia, mes, ano = texto.split("/")
        return date(int(ano), int(mes), int(dia)).isoformat()
    return date.fromisoformat(texto).isoformat()


def _parcela_planilha(value):
    texto = str(value or "").strip()
    partes = re.fullmatch(r"(\d{1,2})\s*/\s*(\d{1,2})", texto)
    if partes:
        return f"{int(partes[1]):02d}/{int(partes[2]):02d}"
    digitos = re.sub(r"\D", "", texto)
    if len(digitos) == 3:
        return f"{int(digitos[0]):02d}/{int(digitos[1:]):02d}"
    if len(digitos) == 4:
        return f"{int(digitos[:2]):02d}/{int(digitos[2:]):02d}"
    return texto


@app.get("/api/exportar-excel")
def api_exportar_excel():
    user = _require_user(request)
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    contas_user = get_contas_from_db(user_id=user["id"])
    dados_categorias = get_categorias_from_db(user_id=user["id"])
    linhas_contas = [["Título", "Tipo", "Centro de custo", "Tipo de despesa", "Subtipo",
                      "Pagamento", "Valor", "Data", "Status", "Observação", "Parcela", "ID"]]
    for conta in contas_user:
        linhas_contas.append([
            conta.get("titulo"), "Pagar" if conta.get("tipo") == "P" else "Receber",
            conta.get("centro"), conta.get("tipoDespesa"), conta.get("subtipo"),
            conta.get("pagamento"), conta.get("valor"), conta.get("data"),
            "Pago" if conta.get("pago") else "Pendente", conta.get("obs"), conta.get("parcela"), conta.get("id")
        ])
    linhas_categorias = [["Grupo", "Cadastro"]]
    for grupo, chave in (("Centro de custo", "centros"), ("Tipo de despesa", "tipos"),
                         ("Subtipo de despesa", "subtipos"), ("Pagamento", "pagamentos")):
        linhas_categorias.extend([[grupo, valor] for valor in dados_categorias.get(chave, [])])

    arquivo = BytesIO(_xls_workbook([("Lançamentos", linhas_contas), ("Cadastros", linhas_categorias)]))
    return send_file(arquivo, mimetype="application/vnd.ms-excel",
                     as_attachment=True, download_name="rscontas_exportacao.xls")


@app.post("/api/importar-excel")
def api_importar_excel():
    user = _require_user(request)
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    arquivo = request.files.get("arquivo")
    if not arquivo or not arquivo.filename.lower().endswith(".xls"):
        return jsonify({"error": "Selecione um arquivo .xls exportado pelo RS Contas."}), 400
    try:
        workbook = xlrd.open_workbook(file_contents=arquivo.read())
        abas = {}
        for sheet_name in workbook.sheet_names():
            sheet = workbook.sheet_by_name(sheet_name)
            abas[sheet_name] = [[sheet.cell_value(row_index, col_index)
                                 for col_index in range(sheet.ncols)]
                                for row_index in range(sheet.nrows)]
            if sheet_name == "Lançamentos" and abas[sheet_name]:
                header_parcela = abas[sheet_name][0]
                if "Parcela" in header_parcela:
                    parcela_col = header_parcela.index("Parcela")
                    for row_index in range(1, sheet.nrows):
                        if sheet.cell_type(row_index, parcela_col) == xlrd.XL_CELL_DATE:
                            data_excel = xlrd.xldate_as_datetime(
                                sheet.cell_value(row_index, parcela_col), workbook.datemode
                            )
                            abas[sheet_name][row_index][parcela_col] = f"{data_excel.day:02d}/{data_excel.month:02d}"
        rows_contas = abas.get("Lançamentos", [])
        rows_categorias = abas.get("Cadastros", [])
        if not rows_contas or rows_contas[0][:2] != ["Título", "Tipo"] or not rows_categorias or rows_categorias[0][:2] != ["Grupo", "Cadastro"]:
            return jsonify({"error": "A planilha não tem as abas ou colunas esperadas. Exporte uma planilha nova pelo RS Contas."}), 400

        conn = get_db_connection()
        grupos = {"Centro de custo": "centros", "Tipo de despesa": "tipos",
                  "Subtipo de despesa": "subtipos", "Pagamento": "pagamentos"}
        total_cadastros = 0

        def incluir_categoria(grupo, valor):
            nonlocal total_cadastros
            valor = str(valor or "").strip()
            if not valor:
                return
            cursor = conn.execute(
                "INSERT OR IGNORE INTO categorias (grupo, valor, user_id) VALUES (?, ?, ?)",
                (grupo, valor, user["id"]),
            )
            total_cadastros += cursor.rowcount

        # Importa a aba de cadastros antes dos lançamentos.
        for row in rows_categorias[1:]:
            if len(row) >= 2 and row[0] in grupos:
                incluir_categoria(grupos[row[0]], row[1])

        header = rows_contas[0]
        parcela_index = header.index("Parcela") if "Parcela" in header else -1
        id_index = header.index("ID") if "ID" in header else -1
        categoria_colunas = (("Centro de custo", "centro"), ("Tipo de despesa", "tipoDespesa"),
                             ("Subtipo", "subtipo"), ("Pagamento", "pagamento"))

        # Novos documentos sem ID podem apresentar valores ainda não cadastrados.
        for row in rows_contas[1:]:
            row += [""] * max(0, len(header) - len(row))
            if id_index >= 0 and str(row[id_index] or "").strip():
                continue
            for coluna, grupo in categoria_colunas:
                if coluna in header:
                    incluir_categoria(grupos[{
                        "centro": "Centro de custo", "tipoDespesa": "Tipo de despesa",
                        "subtipo": "Subtipo de despesa", "pagamento": "Pagamento"
                    }[grupo]], row[header.index(coluna)])

        total_lancamentos = 0
        linhas_ignoradas = []
        for numero_linha, row in enumerate(rows_contas[1:], start=2):
            row += [""] * max(0, len(header) - len(row))
            if not any(row):
                continue
            try:
                tipo = "R" if str(row[1]).strip().lower() in ("receber", "a receber") else "P"
                pago = str(row[8]).strip().lower() == "pago"
                conta = normalize_conta({
                    "id": (str(row[id_index]).strip() if id_index >= 0 else "") or str(uuid.uuid4()),
                    "titulo": str(row[0] or "").strip(), "tipo": tipo,
                    "centro": str(row[2] or "").strip(), "tipoDespesa": str(row[3] or "").strip(),
                    "subtipo": str(row[4] or "").strip(), "pagamento": str(row[5] or "").strip(),
                    "parcela": _parcela_planilha(row[parcela_index]) if parcela_index >= 0 else "",
                    "valor": _valor_planilha(row[6]), "data": _data_planilha(row[7], workbook.datemode),
                    "pago": pago, "obs": str(row[9] or "").strip()
                })
            except (ValueError, TypeError, OverflowError):
                linhas_ignoradas.append({"linha": numero_linha, "motivo": "valor ou data inválidos"})
                continue
            if not conta:
                linhas_ignoradas.append({"linha": numero_linha, "motivo": "pagamento ou parcela ausentes/inválidos"})
                continue
            conn.execute("""INSERT INTO contas
                (id, titulo, tipo, centro, tipoDespesa, subtipo, pagamento, parcela, valor, user_id, data, pago, obs, atualizadoEm)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET titulo=excluded.titulo, tipo=excluded.tipo,
                centro=excluded.centro, tipoDespesa=excluded.tipoDespesa, subtipo=excluded.subtipo,
                pagamento=excluded.pagamento, parcela=excluded.parcela, valor=excluded.valor, data=excluded.data,
                pago=excluded.pago, obs=excluded.obs, atualizadoEm=excluded.atualizadoEm
                WHERE contas.user_id = excluded.user_id""",
                (conta["id"], conta["titulo"], conta["tipo"], conta["centro"], conta["tipoDespesa"],
                 conta["subtipo"], conta.get("pagamento", ""), conta.get("parcela", ""), conta["valor"], user["id"], conta["data"],
                 int(conta["pago"]), conta["obs"], conta["atualizadoEm"] or ""))
            total_lancamentos += 1
        conn.commit()
        conn.close()
        return jsonify({"lancamentos": total_lancamentos, "cadastros": total_cadastros,
                        "ignorados": linhas_ignoradas})
    except (xlrd.XLRDError, ValueError, TypeError):
        return jsonify({"error": "Não foi possível ler a planilha. Confira se é um arquivo .xls exportado pelo RS Contas."}), 400


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
        "pagamento": payload.get("pagamento") or "",
        "parcela": payload.get("parcela") or "",
        "valor": float(payload.get("valor") or 0),
        "data": payload.get("data") or "",
        "pago": bool(payload.get("pago")) ,
        "obs": payload.get("obs") or "",
        "atualizadoEm": payload.get("atualizadoEm") or "",
    }
    if not conta["pagamento"].strip() or not re.fullmatch(r"\d{2}/\d{2}", conta["parcela"].strip()):
        return None
    return conta


@app.get("/")
def index():
    return send_file(BASE_DIR / "index.html")


@app.route("/health")
def health():
    return jsonify({"ok": True, "db": "sqlite"})


@app.get("/api/version")
def api_version():
    try:
        version = VERSION_PATH.read_text(encoding="utf-8").strip()
    except OSError:
        version = "1.0.0"
    return jsonify({"version": version})


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


@app.post("/api/contas/<id>/gerar-parcelas")
def api_gerar_parcelas(id):
    user = _require_user(request)
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db_connection()
    try:
        conn.execute("BEGIN IMMEDIATE")
        payload = request.get_json(silent=True) or {}
        conta = conn.execute(
            "SELECT * FROM contas WHERE id = ? AND user_id = ?", (id, user["id"])
        ).fetchone()
        if not conta:
            return jsonify({"error": "Lançamento não encontrado."}), 404

        match = re.fullmatch(r"(\d{2})/(\d{2})", str(conta["parcela"] or ""))
        if not match:
            return jsonify({"error": "O lançamento precisa ter parcela no formato xx/yy."}), 400
        atual, total = map(int, match.groups())
        if atual < 1 or total > 99 or atual > total:
            return jsonify({"error": "A parcela atual é inválida."}), 400
        try:
            quantidade = int(payload.get("quantidade", 0))
        except (TypeError, ValueError):
            quantidade = 0
        maximo = 99 - atual
        if quantidade < 1 or quantidade > maximo:
            return jsonify({"error": f"Informe uma quantidade entre 1 e {maximo}."}), 400
        try:
            data_base = date.fromisoformat(str(conta["data"]))
        except ValueError:
            return jsonify({"error": "A data de vencimento do lançamento é inválida."}), 400

        criadas = 0
        existentes = 0
        agora = datetime.now().isoformat(timespec="seconds")
        novo_total = max(total, atual + quantidade)
        conn.execute(
            "UPDATE contas SET parcela = ?, atualizadoEm = ? WHERE id = ? AND user_id = ?",
            (f"{atual:02d}/{novo_total:02d}", agora, id, user["id"]),
        )
        for numero_parcela in range(atual + 1, atual + quantidade + 1):
            mes_indice = data_base.month - 1 + (numero_parcela - atual)
            ano = data_base.year + mes_indice // 12
            mes = mes_indice % 12 + 1
            dia = min(data_base.day, calendar.monthrange(ano, mes)[1])
            vencimento = date(ano, mes, dia).isoformat()
            parcela = f"{numero_parcela:02d}/{novo_total:02d}"

            duplicada = conn.execute(
                """SELECT 1 FROM contas WHERE user_id = ? AND parcela = ? AND data = ?
                   AND tipo = ? AND titulo = ? AND centro = ? AND tipoDespesa = ? AND subtipo = ?
                   AND pagamento = ? AND valor = ? LIMIT 1""",
                (user["id"], parcela, vencimento, conta["tipo"], conta["titulo"], conta["centro"],
                 conta["tipoDespesa"], conta["subtipo"], conta["pagamento"], conta["valor"]),
            ).fetchone()
            if duplicada:
                existentes += 1
                continue

            conn.execute(
                """INSERT INTO contas
                   (id, titulo, tipo, centro, tipoDespesa, subtipo, pagamento, parcela, valor,
                    user_id, data, pago, obs, atualizadoEm)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)""",
                (str(uuid.uuid4()), conta["titulo"], conta["tipo"], conta["centro"],
                 conta["tipoDespesa"], conta["subtipo"], conta["pagamento"], parcela,
                 conta["valor"], user["id"], vencimento, conta["obs"], agora),
            )
            criadas += 1

        conn.commit()
        return jsonify({"criadas": criadas, "existentes": existentes, "total": novo_total})
    finally:
        conn.close()


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
        INSERT INTO contas (id, titulo, tipo, centro, tipoDespesa, subtipo, pagamento, parcela, valor, user_id, data, pago, obs, atualizadoEm)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            titulo = excluded.titulo,
            tipo = excluded.tipo,
            centro = excluded.centro,
            tipoDespesa = excluded.tipoDespesa,
            subtipo = excluded.subtipo,
            pagamento = excluded.pagamento,
            parcela = excluded.parcela,
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
            conta.get("pagamento", ""),
            conta.get("parcela", ""),
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
            pagamento = ?,
            parcela = ?,
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
            conta.get("pagamento", ""),
            conta.get("parcela", ""),
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
    email = str(data.get('email') or '').strip().lower()
    celular = str(data.get('celular') or '').strip()
    nome = str(data.get('nome') or '').strip()
    password = str(data.get('password') or '').strip()

    if not email or not password:
        return jsonify({'error': 'Email e senha são obrigatórios'}), 400

    user_id = str(uuid.uuid4())
    pwd_hash = generate_password_hash(password)

    conn = get_db_connection()
    try:
        conn.execute('BEGIN IMMEDIATE')
        if conn.execute('SELECT 1 FROM users WHERE lower(trim(email)) = ?', (email,)).fetchone():
            conn.rollback()
            conn.close()
            return jsonify({'error': 'Este email já está cadastrado.'}), 409

        telefone_novo = re.sub(r'\D', '', celular)
        if telefone_novo:
            telefones = conn.execute("SELECT celular FROM users WHERE celular IS NOT NULL AND trim(celular) <> ''").fetchall()
            if any(re.sub(r'\D', '', row['celular']) == telefone_novo for row in telefones):
                conn.rollback()
                conn.close()
                return jsonify({'error': 'Este telefone já está cadastrado.'}), 409

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


@app.route('/api/me', methods=['GET'])
def api_get_me():
    user = _require_user(request)
    if not user:
        return jsonify({'error': 'Unauthorized'}), 401
    conn = get_db_connection()
    row = conn.execute('SELECT id, email, nome, celular FROM users WHERE id = ?', (user['id'],)).fetchone()
    conn.close()
    if not row:
        return jsonify({'error': 'User not found'}), 404
    return jsonify({'id': row['id'], 'email': row['email'], 'nome': row['nome'], 'celular': row['celular']})


@app.route('/api/me', methods=['PUT'])
def api_update_me():
    user = _require_user(request)
    if not user:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json(silent=True) or {}
    nome = str(data.get('nome') or '').strip()
    email = str(data.get('email') or '').strip()
    celular = str(data.get('celular') or '').strip()
    if not email:
        return jsonify({'error': 'Email obrigatório'}), 400
    conn = get_db_connection()
    try:
        conn.execute('UPDATE users SET nome = ?, email = ?, celular = ? WHERE id = ?', (nome, email, celular, user['id']))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'error': 'Email já em uso'}), 400
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
