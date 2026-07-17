import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import TopBar from "../components/TopBar";

function MiniFlow({ steps }) {
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="px-3 py-2 rounded-2xl border bg-white font-bold text-sm">
              {s}
            </div>
            {i !== steps.length - 1 && (
              <div className="text-gray-400 font-extrabold">→</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Meter({ label, value, hint }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-xs text-gray-600">
        <div className="font-semibold">{label}</div>
        <div className="font-bold">{pct}%</div>
      </div>
      <div className="mt-1 h-3 rounded-full bg-gray-200 overflow-hidden">
        <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
      {hint ? <div className="mt-1 text-xs text-gray-500">{hint}</div> : null}
    </div>
  );
}

function PillRow({ items }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {items.map((x) => (
        <span
          key={x}
          className="px-3 py-1 rounded-full border bg-white text-xs font-bold text-gray-700"
        >
          {x}
        </span>
      ))}
    </div>
  );
}

function CardShell({ agentTitle, short, visual, children }) {
  return (
    <div className="bg-white border rounded-3xl shadow-sm p-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex-1">
          <div className="text-xs text-gray-500 font-semibold">AGENT</div>
          <div className="text-2xl font-extrabold text-gray-900">{agentTitle}</div>
          <div className="mt-2 text-gray-700 leading-relaxed">{short}</div>
        </div>

        <div className="w-full md:w-[360px]">
          <div className="rounded-3xl border bg-[#f0fbf6] p-4">
            <div className="text-xs font-bold text-emerald-800">Visual Summary</div>
            <div className="mt-2">{visual}</div>
          </div>
        </div>
      </div>

      <div className="mt-5">{children}</div>
    </div>
  );
}

export default function HowItWorks() {
  const nav = useNavigate();
  const role = localStorage.getItem("role");

  const [idx, setIdx] = useState(0);
  const [showTech, setShowTech] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (!role) nav("/");
    if (role !== "government") nav("/citizen");
  }, [role, nav]);

  const cards = useMemo(() => {
    return [
      {
        agentTitle: "Overview Agent",
        short:
          "This system helps government officials quickly understand road issues reported by citizens. It uses AI to classify the issue from a photo, understand impact from text/voice, detect duplicates nearby, and keep citizen + government views in sync.",
        visual: (
          <>
            <MiniFlow
              steps={[
                "Citizen",
                "Photo + Location",
                "AI Pipeline",
                "Database",
                "Gov Action",
                "Citizen Status",
              ]}
            />
            <PillRow
              items={[
                "AI Category Detection",
                "Duplicate Grouping",
                "Priority Auto-score",
                "Gov Workflow",
                "Citizen Sync",
              ]}
            />
          </>
        ),
        tech: (
          <>
            <div className="text-sm text-gray-700">
              <b>Technical:</b> The system is a full AI-assisted civic workflow built on{" "}
              <b>FastAPI + MongoDB</b>. Each citizen submission becomes a <b>report</b>, and
              similar reports are grouped under a single <b>master complaint</b>. AI outputs
              (category, impact, email draft) are stored in the database so government officials
              can review and take action quickly.
            </div>
            <div className="mt-3 text-sm text-gray-700">
              <b>AI used:</b> CLIP (image classification + embeddings), Whisper (speech → text),
              SBERT (impact understanding), Ollama LLM (email drafting).
            </div>
          </>
        ),
      },

      {
        agentTitle: "Location Agent",
        short:
          "The citizen confirms the exact location on a map. Accurate location helps government teams find the issue quickly and also helps the system group duplicate reports from nearby areas.",
        visual: (
          <>
            <MiniFlow steps={["GPS", "Map Marker", "Lat/Lon Saved"]} />
            <div className="mt-3 text-sm text-gray-700">
              Example: <b>RV College, Bengaluru</b> → location pinned on map.
            </div>
          </>
        ),
        tech: (
          <div className="text-sm text-gray-700">
            <b>Technical:</b> The location is saved as MongoDB{" "}
            <code className="px-1 py-0.5 rounded bg-gray-100 border">
              GeoJSON Point(lon, lat)
            </code>{" "}
            and indexed using <b>GEOSPHERE</b>. This enables fast radius queries for duplicate
            detection using MongoDB <b>$near</b> search.
          </div>
        ),
      },

      {
        agentTitle: "Photo Understanding Agent (CLIP)",
        short:
          "The system looks at the uploaded photo and detects the problem category (like potholes, garbage, waterlogging, etc.). This makes the complaint structured and easier to process.",
        visual: (
          <>
            <MiniFlow steps={["Photo", "CLIP Model", "Category Output"]} />
            <PillRow
              items={[
                "Garbage on road",
                "Waterlogging",
                "Streetlight failure",
                "Potholes",
                "Broken footpath",
              ]}
            />
            <Meter
              label="Example score strength (illustration)"
              value={86}
              hint="CLIP assigns a score to each category; the highest score wins."
            />
          </>
        ),
        tech: (
          <div className="text-sm text-gray-700">
            <b>Technical:</b> Uses <b>OpenAI CLIP (ViT-B/32)</b>. The uploaded image is compared
            against a fixed set of <b>locked category prompts</b>. CLIP assigns a{" "}
            <b>matching score</b> to every category (Garbage, Waterlogging, Potholes, etc.), and
            the category with the <b>highest score</b> is selected as the final complaint category.
            <div className="mt-2 text-gray-600">
              A special “clear road” class is used to reject non-road-problem images.
            </div>
          </div>
        ),
      },

      {
        agentTitle: "Voice-to-Text Agent (Whisper)",
        short:
          "Citizens can describe the issue using voice. The system converts their speech into text so it can be processed like a normal typed complaint.",
        visual: (
          <>
            <MiniFlow steps={["Voice", "Whisper", "Transcript"]} />
            <div className="mt-3 text-sm text-gray-700">
              Example: “Road has a big pothole near tank bund”
            </div>
            <PillRow items={["English", "Hindi", "Kannada"]} />
          </>
        ),
        tech: (
          <div className="text-sm text-gray-700">
            <b>Technical:</b> Uses <b>OpenAI Whisper</b> to convert speech into text. For stable
            demo behavior, transcription is restricted to <b>English (en), Hindi (hi), and Kannada (kn)</b>.
            The transcript is stored and processed exactly like typed input.
          </div>
        ),
      },

      {
        agentTitle: "Translation Agent",
        short:
          "To keep processing consistent, the system can translate the citizen’s text into English before doing deeper meaning analysis. This helps when citizens write in Kannada or Hindi.",
        visual: (
          <>
            <MiniFlow steps={["Kannada/Hindi Text", "Translator", "English Text"]} />
            <div className="mt-3 text-sm text-gray-700">
              Example: Kannada/Hindi → English meaning kept consistent.
            </div>
          </>
        ),
        tech: (
          <div className="text-sm text-gray-700">
            <b>Technical:</b> To keep meaning-analysis consistent across languages, the system can
            translate the citizen’s text to English using <b>GoogleTranslator (deep_translator)</b>.
            If translation is unavailable, the pipeline continues safely using the original text.
          </div>
        ),
      },

      {
        agentTitle: "Impact Understanding Agent (SBERT)",
        short:
          "The system tries to understand the citizen’s impact (example: unsafe at night, risk of accident, obstruction). This helps create a better email draft and improves clarity for officials.",
        visual: (
          <>
            <MiniFlow steps={["Citizen Text", "SBERT", "Best Impact Match"]} />
            <PillRow
              items={[
                "Risk of accidents",
                "Unsafe at night",
                "Obstruction on road",
                "Difficulty for pedestrians",
              ]}
            />
            <Meter
              label="Impact similarity score (illustration)"
              value={78}
              hint="The closest meaning is selected using similarity matching."
            />
          </>
        ),
        tech: (
          <div className="text-sm text-gray-700">
            <b>Technical:</b> Uses <b>SBERT (SentenceTransformer: all-MiniLM-L6-v2)</b>. The
            citizen’s text is converted into a <b>sentence embedding vector</b>. The system also
            converts predefined impact options into embeddings, then compares them using{" "}
            <b>cosine similarity</b>. The impact option with the <b>highest similarity score</b>{" "}
            is selected as the best match.
          </div>
        ),
      },

      {
        agentTitle: "Duplicate Detection Agent",
        short:
          "If multiple citizens report the same issue near the same place, the system groups them into one master complaint. This reduces government workload and increases priority automatically.",
        visual: (
          <>
            <MiniFlow steps={["New Report", "Nearby Search", "Image Similarity", "Merge"]} />
            <div className="mt-3 text-sm text-gray-700">
              Example: Same pothole near <b>Tank Bund</b> reported by 4 citizens → 1 master complaint + 4 reports.
            </div>
          </>
        ),
        tech: (
          <div className="text-sm text-gray-700">
            <b>Technical:</b> Duplicate detection is decided using a 2-step AI + Geo rule:
            <ul className="list-disc ml-5 mt-2">
              <li>
                <b>Geo filter:</b> MongoDB <b>$near</b> checks unresolved complaints within a radius.
              </li>
              <li>
                <b>AI similarity:</b> CLIP image embeddings are compared using <b>cosine similarity</b>.
                If similarity ≥ <b>0.80</b>, the report is grouped into the same master complaint.
              </li>
            </ul>

            <div className="mt-3 text-gray-600">
              This prevents duplicates from flooding the government inbox and automatically groups “same issue” reports.
            </div>

            <div className="mt-3">
              <button
                onClick={() => setShowAdvanced((x) => !x)}
                className="px-4 py-2 rounded-2xl border font-bold hover:bg-gray-50"
              >
                {showAdvanced ? "Hide Advanced Details" : "Show Advanced Details"}
              </button>

              {showAdvanced && (
                <div className="mt-3 p-3 rounded-2xl border bg-gray-50 text-sm">
                  <div>
                    <b>Nearby distance threshold:</b> 100 meters
                  </div>
                  <div>
                    <b>Image similarity threshold:</b> 0.80
                  </div>
                </div>
              )}
            </div>
          </div>
        ),
      },

      {
        agentTitle: "Priority / Severity Agent",
        short:
          "The system automatically assigns priority based on how many people reported the same issue. More duplicates → higher priority. Senior citizens can also boost priority.",
        visual: (
          <>
            <MiniFlow steps={["Duplicate Count", "Priority Rules", "High/Medium/Low"]} />
            <PillRow items={["Low", "Medium", "High"]} />
            <div className="mt-3 text-sm text-gray-700">
              Example: 1 report → Low, 2–4 reports → Medium, 5+ → High
            </div>
          </>
        ),
        tech: (
          <div className="text-sm text-gray-700">
            <b>Technical:</b> Priority is computed using rule-based logic (fast + explainable):
            <ul className="list-disc ml-5 mt-2">
              <li>duplicate_count ≥ 4 → <b>High</b></li>
              <li>duplicate_count ≥ 1 → <b>Medium</b></li>
              <li>else → <b>Low</b></li>
              <li>age ≥ 60 boosts priority by one level</li>
            </ul>
            <div className="mt-2 text-gray-600">
              duplicate_count here means the number of extra reports beyond the first report.
            </div>
          </div>
        ),
      },

      {
        agentTitle: "Email Drafting Agent (Ollama)",
        short:
          "For new complaints, the system generates a formal email draft in an Indian civic complaint style. This makes reporting faster and more consistent.",
        visual: (
          <>
            <MiniFlow steps={["Category + Locality", "Email Prompt", "Draft Output"]} />
            <div className="mt-3 text-sm text-gray-700">
              Example: “Potholes / damaged road in RV College area”
            </div>
          </>
        ),
        tech: (
          <div className="text-sm text-gray-700">
            <b>Technical:</b> Uses <b>Ollama (llama3.1:8b)</b> to generate a short,
            formal civic complaint email. The prompt forces strict formatting:
            <ul className="list-disc ml-5 mt-2">
              <li>8–12 lines maximum</li>
              <li>Includes To / Subject / Date</li>
              <li>Mentions photo is attached</li>
              <li>Closing includes citizen name + phone</li>
              <li>Must not mention AI/ML</li>
            </ul>
            <div className="mt-2 text-gray-600">
              If Ollama is offline, the system uses a safe fallback template so submission never fails.
            </div>
          </div>
        ),
      },

      {
        agentTitle: "Government Action Agent",
        short:
          "Officials review the master complaint (photo, location, duplicates, priority) and then mark it Fixed or Rejected. This immediately updates citizen status views too.",
        visual: (
          <>
            <MiniFlow steps={["Gov Review", "Set Status", "Citizen Sees Update"]} />
            <PillRow items={["Unresolved", "Fixed", "Rejected"]} />
          </>
        ),
        tech: (
          <div className="text-sm text-gray-700">
            <b>Technical:</b> Government actions update the <b>master complaint status</b>{" "}
            (unresolved / fixed / rejected). Once marked fixed or rejected, the status becomes{" "}
            <b>finalized</b> and cannot be changed again. Citizen reports automatically reflect
            this status because both portals read from the same MongoDB master complaint record.
          </div>
        ),
      },

      {
        agentTitle: "Citizen + Government Sync Agent",
        short:
          "The citizen and government portals are connected through the same database. Actions on one side should reflect correctly on the other side.",
        visual: (
          <>
            <MiniFlow
              steps={[
                "Citizen Submit",
                "DB Update",
                "Gov Inbox",
                "Gov Action",
                "Citizen My Complaints",
              ]}
            />
            <div className="mt-3 text-sm text-gray-700">
              Final outcome: <b>One source of truth</b> → MongoDB.
            </div>
          </>
        ),
        tech: (
          <div className="text-sm text-gray-700">
            <b>Technical:</b> The project maintains a “single source of truth” in MongoDB:
            <ul className="list-disc ml-5 mt-2">
              <li>
                <b>complaints</b> → master complaint (category, priority, duplicates, email draft, status)
              </li>
              <li>
                <b>reports</b> → individual citizen submissions linked to the master
              </li>
            </ul>
            Any update (cancel, fix, reject, delete) immediately affects what both portals display,
            ensuring consistency.
          </div>
        ),
      },
    ];
  }, [showAdvanced]);

  const total = cards.length;
  const current = cards[idx];

  function next() {
    setShowTech(false);
    setShowAdvanced(false);
    setIdx((x) => Math.min(total - 1, x + 1));
  }

  function prev() {
    setShowTech(false);
    setShowAdvanced(false);
    setIdx((x) => Math.max(0, x - 1));
  }

  return (
    <div className="min-h-screen bg-[#f4fbf7]">
      <TopBar title="How It Works (Government Guide)" />

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="bg-white border rounded-3xl shadow-sm p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="text-2xl font-extrabold">
                Community Problem Mapper — System Flow
              </div>
              <div className="text-sm text-gray-600 mt-1">
                Flashcards explaining every step of the AI + portal workflow.
              </div>
              <div className="mt-2 text-xs text-gray-600">
                <b>AI Integrated:</b> CLIP (image) • Whisper (voice) • SBERT (impact) • Ollama (email)
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full border bg-gray-50 text-sm font-bold">
                Card {idx + 1} / {total}
              </span>
              <button
                onClick={() => nav("/gov")}
                className="px-4 py-2 rounded-2xl border font-bold hover:bg-gray-50"
              >
                Back to Inbox
              </button>
            </div>
          </div>

          <div className="mt-4 h-2 rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${((idx + 1) / total) * 100}%` }}
            />
          </div>
        </div>

        <div className="mt-5">
          <CardShell agentTitle={current.agentTitle} short={current.short} visual={current.visual}>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <button
                onClick={() => setShowTech((x) => !x)}
                className="px-4 py-2 rounded-2xl bg-emerald-600 text-white font-bold hover:opacity-95"
              >
                {showTech ? "Hide Technical Explanation" : "Show Technical Explanation"}
              </button>

              <div className="flex gap-2">
                <button
                  onClick={prev}
                  disabled={idx === 0}
                  className="px-4 py-2 rounded-2xl border font-bold hover:bg-gray-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={next}
                  disabled={idx === total - 1}
                  className="px-4 py-2 rounded-2xl border font-bold hover:bg-gray-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>

            {showTech && (
              <div className="mt-4 p-4 rounded-3xl border bg-gray-50">
                <div className="text-sm font-extrabold text-gray-800">Technical Explanation</div>
                <div className="mt-2">{current.tech}</div>
              </div>
            )}
          </CardShell>
        </div>
      </div>
    </div>
  );
}
