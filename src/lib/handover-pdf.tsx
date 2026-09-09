import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { shiftLabel, type HandoverPayload } from "@/lib/handover-payload";

const styles = StyleSheet.create({
  page: {
    padding: 44,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#2b322c",
    lineHeight: 1.5,
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: "#6b9b7c",
    paddingBottom: 10,
    marginBottom: 16,
  },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#3a4a40" },
  meta: { marginTop: 4, color: "#5c6b60" },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginTop: 14,
    marginBottom: 4,
    color: "#3a4a40",
  },
  paragraph: { marginBottom: 4 },
  entry: {
    borderWidth: 1,
    borderColor: "#e0e4dc",
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
  },
  entryHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  residentName: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  incident: {
    color: "#a23b2a",
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  label: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: "#5c6b60",
    marginTop: 3,
  },
  muted: { color: "#8a968c" },
  addendum: {
    borderLeftWidth: 2,
    borderLeftColor: "#c9a24b",
    paddingLeft: 8,
    marginBottom: 6,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 44,
    right: 44,
    fontSize: 8,
    color: "#8a968c",
    borderTopWidth: 1,
    borderTopColor: "#e0e4dc",
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

function fmtDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function Value({ label, text }: { label: string; text: string | null }) {
  if (!text) return null;
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Text>{text}</Text>
    </View>
  );
}

export function HandoverDocument({ data }: { data: HandoverPayload }) {
  return (
    <Document
      title={`Handover — ${data.date} ${shiftLabel(data.shift)}`}
      author={data.startedBy}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {data.site.name} — Shift handover
          </Text>
          <Text style={styles.meta}>
            {shiftLabel(data.shift)} shift · {fmtDate(data.date)}
          </Text>
          <Text style={styles.meta}>
            Started by {data.startedBy}
            {data.submittedAt
              ? ` · Submitted ${fmtDateTime(data.submittedAt)}${
                  data.submittedBy ? ` by ${data.submittedBy}` : ""
                }`
              : " · DRAFT (not yet submitted)"}
          </Text>
          {data.contributors.length > 1 ? (
            <Text style={styles.meta}>
              Contributors: {data.contributors.join(", ")}
            </Text>
          ) : null}
        </View>

        {data.generalNotes ? (
          <View>
            <Text style={styles.sectionTitle}>House notes</Text>
            <Text style={styles.paragraph}>{data.generalNotes}</Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Residents</Text>
        {data.entries.length === 0 ? (
          <Text style={styles.muted}>No resident entries.</Text>
        ) : (
          data.entries.map((e, i) => (
            <View key={i} style={styles.entry} wrap={false}>
              <View style={styles.entryHead}>
                <Text style={styles.residentName}>
                  {e.resident}
                  {e.room ? `  ·  Room ${e.room}` : ""}
                </Text>
                {e.incidentFlag ? (
                  <Text style={styles.incident}>INCIDENT LOGGED</Text>
                ) : null}
              </View>
              {!e.narrative &&
              !e.moodObservations &&
              !e.tasksOutstanding &&
              !e.appointments ? (
                <Text style={styles.muted}>Nothing to report this shift.</Text>
              ) : (
                <>
                  <Value label="How the shift went" text={e.narrative} />
                  <Value label="Mood / observations" text={e.moodObservations} />
                  <Value label="Tasks outstanding" text={e.tasksOutstanding} />
                  <Value label="Appointments" text={e.appointments} />
                </>
              )}
            </View>
          ))
        )}

        {data.addenda.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Added afterwards</Text>
            {data.addenda.map((a, i) => (
              <View key={i} style={styles.addendum} wrap={false}>
                <Text style={styles.label}>
                  {a.author} · {fmtDateTime(a.at)}
                </Text>
                <Text>{a.body}</Text>
              </View>
            ))}
          </>
        ) : null}

        <View style={styles.footer} fixed>
          <Text>
            {data.site.name} · {shiftLabel(data.shift)} · {data.date}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

export function renderHandoverPdf(data: HandoverPayload): Promise<Buffer> {
  return renderToBuffer(<HandoverDocument data={data} />);
}
