import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { roundLabel } from "@/lib/medication";
import type { MarPayload } from "@/lib/medication-payload";

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#2b322c",
    lineHeight: 1.4,
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: "#6b9b7c",
    paddingBottom: 10,
    marginBottom: 14,
  },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#3a4a40" },
  meta: { marginTop: 3, color: "#5c6b60" },
  medBlock: { marginBottom: 10 },
  medTitle: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  medSubtitle: { fontSize: 8, color: "#5c6b60", marginBottom: 3 },
  cdBadge: { color: "#8a5a13", fontFamily: "Helvetica-Bold", fontSize: 8 },
  gridHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#c9d0c9",
    paddingBottom: 2,
  },
  gridRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e8ebe6",
  },
  roundCol: { width: 62, fontSize: 8, fontFamily: "Helvetica-Bold" },
  dayHeaderCol: { flex: 1, fontSize: 7, textAlign: "center", color: "#5c6b60" },
  dayCol: { flex: 1, fontSize: 7, textAlign: "center" },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginTop: 10,
    marginBottom: 6,
    color: "#3a4a40",
  },
  prnRow: {
    borderWidth: 1,
    borderColor: "#e0e4dc",
    borderRadius: 4,
    padding: 6,
    marginBottom: 5,
  },
  muted: { color: "#8a968c" },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    fontSize: 7,
    color: "#8a968c",
    borderTopWidth: 1,
    borderTopColor: "#e0e4dc",
    paddingTop: 5,
  },
});

const OUTCOME_CODE: Record<string, string> = {
  given: "G",
  refused: "R",
  omitted: "O",
  not_available: "NA",
  self_admin: "SA",
};

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short" }).format(
    new Date(`${iso}T00:00:00`),
  );
}

function fmtDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  );
}

export function MarDocument({ data }: { data: MarPayload }) {
  return (
    <Document title={`MAR — ${data.resident.name} — ${data.weekStart}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {data.site.name} — Medication administration record
          </Text>
          <Text style={styles.meta}>
            {data.resident.name}
            {data.resident.room ? ` · Room ${data.resident.room}` : ""}
            {data.resident.dateOfBirth ? ` · DOB ${data.resident.dateOfBirth}` : ""}
          </Text>
          <Text style={styles.meta}>
            Week of {fmtDate(data.weekStart)} – {fmtDate(data.weekEnd)}
          </Text>
        </View>

        {data.medications.length === 0 ? (
          <Text style={styles.muted}>No scheduled medications.</Text>
        ) : (
          data.medications.map((m) => (
            <View key={m.id} style={styles.medBlock} wrap={false}>
              <Text style={styles.medTitle}>
                {m.name}
                {m.strength ? ` ${m.strength}` : ""}
                {m.isControlledDrug ? "  " : ""}
                {m.isControlledDrug ? <Text style={styles.cdBadge}>CD</Text> : null}
              </Text>
              {m.form ? <Text style={styles.medSubtitle}>{m.form}</Text> : null}

              <View style={styles.gridHeaderRow}>
                <Text style={styles.roundCol}> </Text>
                {data.days.map((day) => (
                  <Text key={day} style={styles.dayHeaderCol}>
                    {fmtDate(day)}
                  </Text>
                ))}
              </View>

              {m.rounds.map((round) => (
                <View key={round} style={styles.gridRow}>
                  <Text style={styles.roundCol}>{roundLabel(round)}</Text>
                  {data.days.map((day) => {
                    const due = round in (m.cells[day] ?? {});
                    const cell = m.cells[day]?.[round];
                    return (
                      <Text key={day} style={styles.dayCol}>
                        {!due
                          ? "-"
                          : cell
                            ? `${OUTCOME_CODE[cell.outcome] ?? "?"} ${cell.staffInitials}${
                                cell.witnessInitials ? `/${cell.witnessInitials}` : ""
                              }`
                            : "·"}
                      </Text>
                    );
                  })}
                </View>
              ))}
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>PRN (as-needed) doses this week</Text>
        {data.prn.length === 0 ? (
          <Text style={styles.muted}>None recorded.</Text>
        ) : (
          data.prn.map((p, i) => (
            <View key={i} style={styles.prnRow} wrap={false}>
              <Text>
                {fmtDateTime(p.administeredAt)} · {p.medicationName} ·{" "}
                {OUTCOME_CODE[p.outcome] ?? p.outcome} · {p.staffInitials}
              </Text>
              {p.reason ? <Text style={styles.muted}>Why: {p.reason}</Text> : null}
              {p.effectNote ? <Text style={styles.muted}>Effect: {p.effectNote}</Text> : null}
            </View>
          ))
        )}

        <View style={styles.footer} fixed>
          <Text>
            Printed MAR — for continuity of care only, not a substitute for the live system.
            Generated {fmtDateTime(data.generatedAt)}. G=Given R=Refused O=Omitted NA=Not
            available SA=Self-administered. CD rows show staff/witness initials.
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export function renderMarPdf(data: MarPayload): Promise<Buffer> {
  return renderToBuffer(<MarDocument data={data} />);
}
