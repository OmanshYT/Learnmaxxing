"""Formula sheet as typeset math (MathML), written like it would be on paper.

Edit SHEET below, then run build.py. Notation (LaTeX-lite):
  \\frac{a}{b}  x^{2}  x_{n}  \\times \\cdot \\to \\Delta \\lambda ...  \\text{words}  \\mathrm{unit}  ~ (small space)
"""
import html

GREEK = {"lambda": "λ", "nu": "ν", "mu": "μ", "ell": "ℓ", "Delta": "Δ", "Sigma": "Σ"}
OPS = {"times": "×", "cdot": "·", "div": "÷", "to": "→", "sum": "∑", "deg": "°"}


def esc(s):
    return html.escape(s, quote=False)


class P:
    def __init__(self, s):
        self.s, self.i = s, 0

    def peek(self):
        while self.i < len(self.s) and self.s[self.i] == " ":
            self.i += 1
        return self.s[self.i] if self.i < len(self.s) else ""

    def group(self):
        assert self.peek() == "{", self.s
        self.i += 1
        nodes = self.seq()
        assert self.s[self.i] == "}", self.s
        self.i += 1
        return "<mrow>" + nodes + "</mrow>"

    def raw_group(self):
        assert self.peek() == "{", self.s
        j = self.s.index("}", self.i)
        t = self.s[self.i + 1:j]
        self.i = j + 1
        return t

    def seq(self):
        out = []
        while self.peek() not in ("", "}"):
            out.append(self.postfix())
        return "".join(out)

    def postfix(self):
        base = self.atom()
        sub = sup = None
        while self.peek() in ("_", "^"):
            c = self.s[self.i]
            self.i += 1
            arg = self.atom()
            if c == "_":
                sub = arg
            else:
                sup = arg
        if sub and sup:
            return f"<msubsup>{base}{sub}{sup}</msubsup>"
        if sub:
            return f"<msub>{base}{sub}</msub>"
        if sup:
            return f"<msup>{base}{sup}</msup>"
        return base

    def atom(self):
        c = self.peek()
        if c == "{":
            return self.group()
        if c == "~":
            self.i += 1
            return '<mspace width="0.35em"></mspace>'
        if c == "\\":
            self.i += 1
            j = self.i
            while j < len(self.s) and self.s[j].isalpha():
                j += 1
            name = self.s[self.i:j] or self.s[self.i]
            self.i = j if j > self.i else self.i + 1
            if name == "frac":
                a, b = self.group(), self.group()
                return f"<mfrac>{a}{b}</mfrac>"
            if name == "text":
                return f"<mtext>{esc(self.raw_group())}</mtext>"
            if name == "mathrm":
                return f'<mi mathvariant="normal">{esc(self.raw_group())}</mi>'
            if name == "xrightarrow":
                return f"<mover><mo>→</mo>{self.group()}</mover>"
            if name in ("left", "right"):
                return self.atom()
            if name in GREEK:
                return f"<mi>{GREEK[name]}</mi>" if name not in ("Delta", "Sigma") else f'<mi mathvariant="normal">{GREEK[name]}</mi>'
            if name in OPS:
                return f"<mo>{OPS[name]}</mo>"
            if not name.isalpha():
                return f"<mo>{esc(name)}</mo>"
            raise ValueError(name)
        if c.isdigit() or c == ".":
            j = self.i
            while j < len(self.s) and (self.s[j].isdigit() or self.s[j] == "."):
                j += 1
            n = self.s[self.i:j]
            self.i = j
            return f"<mn>{n}</mn>"
        self.i += 1
        if c.isalpha():
            return f"<mi>{c}</mi>"
        return f"<mo>{esc('−' if c == '-' else c)}</mo>"


def m(tex):
    return '<math><mstyle displaystyle="true"><mrow>' + P(tex).seq() + "</mrow></mstyle></math>"


def row(label, *eqs):
    body = "".join(f'<span class="f-eq">{m(e)}</span>' for e in eqs)
    return f'<div class="f-row"><span class="f-label">{esc(label)}</span><span class="f-eqs">{body}</span></div>'


def note(text, *eqs):
    body = "".join(f'<span class="f-eq">{m(e)}</span>' for e in eqs)
    return f'<div class="f-row"><span class="f-label">{esc(text)}</span><span class="f-eqs">{body}</span></div>'


def table(head, rows):
    h = "".join(f"<th>{c}</th>" for c in head)
    b = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return f"<div class='table-wrap'><table class='f-table'><thead><tr>{h}</tr></thead><tbody>{b}</tbody></table></div>"


MR = lambda t: f"<span class='f-eq'>{m(t)}</span>"

SHEET = [
    ("Constants", [
        table(["Constant", "Value"], [
            ["Speed of light", MR(r"c=3.00\times10^{8}~\mathrm{m/s}")],
            ["Planck's constant", MR(r"h=6.626\times10^{-34}~\mathrm{J·s}")],
            ["Avogadro's number", MR(r"N_A=6.022\times10^{23}~\mathrm{mol}^{-1}")],
            ["Gas constant", MR(r"R=0.08206~\frac{\mathrm{L·atm}}{\mathrm{mol·K}}=8.314~\frac{\mathrm{J}}{\mathrm{mol·K}}")],
            ["Elementary charge", MR(r"e=1.602\times10^{-19}~\mathrm{C}")],
            ["Debye", MR(r"1~\mathrm{D}=3.336\times10^{-30}~\mathrm{C·m}")],
            ["Pressure", MR(r"1~\mathrm{atm}=760~\mathrm{mmHg}=101.325~\mathrm{kPa}")],
        ]),
    ]),
    ("Ch 1: Matter and atoms", [
        row("Moles", r"n=\frac{\text{mass}}{\text{molar mass}}"),
        row("Particles", r"\text{particles}=n\times N_A"),
        row("Average atomic mass", r"\text{avg. atomic mass}=\sum\left(\text{isotope mass}\times\text{fractional abundance}\right)"),
        row("Mass number", r"A=Z+N"),
        row("Ion charge", r"\text{charge}=\text{protons}-\text{electrons}"),
    ]),
    ("Ch 2: Light and quantum", [
        row("Wave equation", r"c=\lambda\nu"),
        row("Photon energy", r"E=h\nu"),
        row("Photoelectric effect", r"h\nu=W+KE", r"W=h\nu_0", r"KE=\frac{1}{2}mv^{2}"),
        row("Bohr energy levels", r"E_n=-\frac{2.18\times10^{-18}~\mathrm{J}}{n^{2}}"),
        row("Bohr transition", r"\Delta E=2.18\times10^{-18}~\mathrm{J}\left(\frac{1}{{n_{\text{low}}}^{2}}-\frac{1}{{n_{\text{high}}}^{2}}\right)"),
        row("de Broglie", r"\lambda=\frac{h}{mv}"),
        row("Shell capacity", r"2n^{2}"),
        row("Orbitals per subshell", r"2\ell+1"),
    ]),
    ("Ch 3: Periodic trends", [
        row("Effective nuclear charge", r"Z_{\text{eff}}=Z-S"),
    ]),
    ("Ch 4: Bonding, formulas", [
        row("Percent by mass", r"\%~\text{by mass}=\frac{\text{mass of element}}{\text{molar mass}}\times100"),
        row("Molecular formula", r"\text{molecular}=\text{empirical}\times n", r"n=\frac{M}{M_{\text{empirical}}}"),
        row("Combustion analysis", r"\text{mass C}=\text{mass}~\mathrm{CO}_2\times\frac{12.01}{44.01}", r"\text{mass H}=\text{mass}~\mathrm{H}_2\mathrm{O}\times\frac{2.016}{18.02}"),
    ]),
    ("Ch 5: Polarity, Lewis, VSEPR", [
        row("Formal charge", r"\text{formal charge}=\text{valence e}^{-}-\left(\text{nonbonding e}^{-}+\frac{1}{2}\,\text{bonding e}^{-}\right)"),
        row("Percent ionic character", r"\%~\text{ionic}=\frac{\mu_{\text{measured}}}{e\times d}\times100"),
        table(["Bond type", r"Electronegativity difference"], [
            ["Nonpolar", MR(r"\Delta EN<0.4")],
            ["Polar", MR(r"0.4≤\Delta EN≤1.7")],
            ["Ionic", MR(r"\Delta EN>1.7")],
        ]).replace("\\le", "≤"),
        table(["Electron domains", "Geometry"], [
            ["2", "linear"], ["3", "trigonal planar"], ["4", "tetrahedral"],
            ["5", "trigonal bipyramidal"], ["6", "octahedral"],
        ]),
    ]),
    ("Ch 6: Bonding theories", [
        row("Bond order", r"\text{bond order}=\frac{1}{2}\left(\text{bonding e}^{-}-\text{antibonding e}^{-}\right)"),
        table(["Electron domains", "Hybridization"], [
            ["2", MR(r"\mathrm{sp}")], ["3", MR(r"\mathrm{sp}^{2}")], ["4", MR(r"\mathrm{sp}^{3}")],
            ["5", MR(r"\mathrm{sp}^{3}\mathrm{d}")], ["6", MR(r"\mathrm{sp}^{3}\mathrm{d}^{2}")],
        ]),
    ]),
    ("Ch 7: Stoichiometry", [
        row("Mass path", r"\text{g A}\xrightarrow{\div M_A}\text{mol A}\xrightarrow{\times\text{ratio}}\text{mol B}\xrightarrow{\times M_B}\text{g B}"),
        row("Limiting reactant", r"\text{smallest moles of product}"),
        row("Percent yield", r"\%~\text{yield}=\frac{\text{actual}}{\text{theoretical}}\times100"),
    ]),
    ("Ch 8: Solutions", [
        row("Molarity", r"M=\frac{\text{mol}}{\text{L}}"),
        row("Dilution", r"M_1V_1=M_2V_2"),
        row("Mass percent", r"\text{mass}~\%=\frac{\text{mass solute}}{\text{mass solution}}\times100"),
    ]),
    ("Ch 9: Thermochemistry", [
        row("First law", r"\Delta E=q+w", r"w=-P\Delta V"),
        row("Heat", r"q=mc\Delta T", r"c_{\text{water}}=4.184~\frac{\mathrm{J}}{\mathrm{g·°C}}"),
        row("Enthalpy (constant P)", r"\Delta H=\Delta E+P\Delta V"),
        row("Hess's law", r"\text{sum the steps; flip the sign when a step is reversed}"),
        row("Bomb calorimeter", r"q=-C_{\text{cal}}\Delta T"),
        row("Conversions", r"1~\mathrm{cal}=4.184~\mathrm{J}", r"1~\mathrm{L·atm}=101.3~\mathrm{J}"),
    ]),
    ("Ch 10: Gases", [
        row("Ideal gas law", r"PV=nRT", r"T~(\mathrm{K})=T~(°\mathrm{C})+273.15"),
        row("Boyle", r"P_1V_1=P_2V_2"),
        row("Charles", r"\frac{V_1}{T_1}=\frac{V_2}{T_2}"),
        row("Avogadro", r"\frac{V}{n}=\text{constant}"),
        row("Combined", r"\frac{P_1V_1}{T_1}=\frac{P_2V_2}{T_2}"),
        row("STP", r"273.15~\mathrm{K},~1~\mathrm{atm},~22.4~\mathrm{L/mol}"),
        row("Density and molar mass", r"d=\frac{PM}{RT}", r"M=\frac{dRT}{P}"),
        row("Dalton's law", r"P_{\text{total}}=\sum P_i", r"P_i=X_i\,P_{\text{total}}"),
    ]),
    ("Ch 11: Phases", [
        row("Heat of phase change", r"q=n\,\Delta H_{\text{vap}}~(	ext{or}~\Delta H_{\text{fus}})"),
        row("Boiling point", r"P_{\text{vapor}}=P_{\text{external}}"),
    ]),
    ("Quick checks", [
        row("Electrons in an ion", r"\text{electrons}=Z-\text{charge}"),
        row("Moles of ions", r"\text{mol ions}=\text{mol formula units}\times\text{ions per formula}"),
        row("Molar mass of a gas at STP", r"M=d\times22.4~\mathrm{L/mol}"),
    ]),
]


def build():
    out = ['<div class="formula-sheet">']
    for title, items in SHEET:
        out.append(f"<h2>{esc(title)}</h2>" + "".join(items))
    out.append("</div>")
    return "\n".join(out)
