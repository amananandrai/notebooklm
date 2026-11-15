/** Export a generated artifact as a Markdown / text / CSV file. */
import { cleanTitle } from './tabs';

export function downloadArtifact(tab, artifacts, activeDoc) {
  if (!activeDoc || !artifacts) return;

  let content = '';
  let fileName = '';
  const safeTitle = cleanTitle(activeDoc);

  if (tab === 'video') {
    fileName = `${safeTitle}_Presentation_Script.md`;
    const audioData = artifacts.audio || [];
    const slidesData = artifacts.slides || [];
    
    content = `# Full 3D Presentation Script & Slides — ${safeTitle}\n\n`;
    content += `## 🎙️ Podcast Audio Dialogue Script\n\n` + 
      audioData.map(turn => `**${turn.speaker}**: ${turn.text}`).join('\n\n') + '\n\n';
    content += `---\n\n## 📊 Slide Deck Outline\n\n` + 
      slidesData.map((s, idx) => `### Slide ${idx + 1}: ${s.title}\n*Bullets:*\n${(s.bullets || []).map(b => `- ${b}`).join('\n')}\n\n*Speaker Notes:* ${s.speakerNotes || 'N/A'}\n`).join('\n---\n\n');
  }
  
  else {
    const data = artifacts[tab];
    if (!data) return;

    if (tab === 'mindmap') {
      fileName = `${safeTitle}_MindMap.md`;
      
      function formatNode(node, depth = 0) {
        let str = '  '.repeat(depth) + `- **${node.label}** (${node.category || 'Concept'})\n`;
        if (node.description) {
          str += '  '.repeat(depth + 1) + `*Description:* ${node.description}\n`;
        }
        if (node.children?.length) {
          node.children.forEach(c => {
            str += formatNode(c, depth + 1);
          });
        }
        return str;
      }
      content = `# Mind Map Tree — ${safeTitle}\n\n${formatNode(data)}`;
    }
    
    else if (tab === 'audio') {
      fileName = `${safeTitle}_AudioScript.txt`;
      content = `NotebookLM Podcast Dialogue Script - ${safeTitle}\n\n` + 
        data.map(turn => `[${turn.speaker}]: ${turn.text}`).join('\n\n');
    }
    
    else if (tab === 'slides') {
      fileName = `${safeTitle}_Slides.md`;
      content = `# Slides Presentation Outline — ${safeTitle}\n\n` + 
        data.map((s, idx) => {
          let slideStr = `## Slide ${idx + 1}: ${s.title}\n`;
          if (s.subtitle) slideStr += `*${s.subtitle}*\n\n`;
          slideStr += (s.bullets || []).map(b => `- ${b}`).join('\n') + '\n\n';
          if (s.speakerNotes) slideStr += `**Speaker Notes:** *${s.speakerNotes}*\n\n`;
          return slideStr;
        }).join('---\n\n');
    }
    
    else if (tab === 'slides_img') {
      fileName = `${safeTitle}_SlidesWithImages.md`;
      content = `# Slides with Images — ${safeTitle}\n\n` +
        data.map((s, idx) => {
          let slideStr = `## Slide ${idx + 1}: ${s.title}\n`;
          if (s.subtitle) slideStr += `*${s.subtitle}*\n\n`;
          slideStr += (s.bullets || []).map(b => `- ${b}`).join('\n') + '\n\n';
          if (s.speakerNotes) slideStr += `**Speaker Notes:** *${s.speakerNotes}*\n\n`;
          if (s.imagePrompt) slideStr += `**Image Prompt:** ${s.imagePrompt}\n\n`;
          return slideStr;
        }).join('---\n\n');
    }
    
    else if (tab === 'infographic') {
      fileName = `${safeTitle}_Infographic.md`;
      content = `# Infographic Summary — ${safeTitle}\n\n## ${data.title}\n*${data.subtitle || ''}*\n\n` +
        `### Key Metrics\n` + (data.stats || []).map(s => `- **${s.label}**: ${s.value} (${s.desc || ''})`).join('\n') + '\n\n' +
        `### Core Sections\n` + (data.sections || []).map(s => `#### ${s.title}\n${s.summary}\n`).join('\n') + '\n' +
        (data.keyInsight ? `\n> **Core Takeaway:** ${data.keyInsight}\n` : '');
    }
    
    else if (tab === 'studyguide') {
      fileName = `${safeTitle}_StudyGuide.md`;
      content = `# Study Guide & Quiz — ${safeTitle}\n\n## 🎴 Flashcards\n\n` +
        (data.flashcards || []).map(f => `**Q:** ${f.question}\n**A:** ${f.answer}\n*Category:* ${f.category}\n`).join('\n---\n\n') +
        `\n## 🧩 Quiz Questions\n\n` +
        (data.quiz || []).map((q, idx) => `### Q${idx + 1}: ${q.question}\n` + (q.options || []).map((o, oi) => `  ${String.fromCharCode(65 + oi)}) ${o}`).join('\n') + `\n*Correct Answer:* Option ${String.fromCharCode(65 + q.correctIndex)}\n*Explanation:* ${q.explanation}\n`).join('\n---\n\n');
    }

    else if (tab === 'report') {
      fileName = `${safeTitle}_Report.md`;
      content = `# ${data.reportTitle || 'Executive Report'}\n\n**Type:** ${data.reportType || 'Detailed'}\n\n## Executive Summary\n${data.executiveSummary || ''}\n\n` +
        `## Key Findings\n` + (data.keyFindings || []).map((f, i) => `${i + 1}. ${f}`).join('\n') + '\n\n' +
        `## Detailed Sections\n` + (data.sections || []).map(s => `### ${s.title}\n${s.content}\n`).join('\n') + '\n' +
        `## Strategic Recommendations\n` + (data.strategicRecommendations || []).map(r => `- ✓ ${r}`).join('\n') + '\n\n' +
        `## Risk Analysis\n` + (data.riskAnalysis || []).map(r => `- **${r.risk}** (${r.severity}): ${r.mitigation}`).join('\n') + '\n\n' +
        `## Conclusion\n${data.conclusion || ''}`;
    }

    else if (tab === 'datatable') {
      fileName = `${safeTitle}_DataTable.csv`;
      const cols = data.columns || [];
      content = cols.join(',') + '\n' +
        (data.rows || []).map(row => cols.map(c => `"${String(row[c] || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    }

    else if (tab === 'synthesis') {
      fileName = `${safeTitle}_Synthesis.md`;
      content = `# Cross-Document Synthesis\n\n## ${data.synthesisTitle || 'Multi-Source Analysis'}\n\n` +
        `**Documents Analyzed:** ${(data.documentsAnalyzed || []).join(', ')}\n\n` +
        `## Common Themes\n` + (data.commonThemes || []).map(t => `### ${t.theme}\n${t.evidence}\n`).join('\n') + '\n' +
        `## Contradictions\n` + (data.contradictions || []).map(c => `- **${c.topic}**: Doc A says "${c.docA}" vs Doc B says "${c.docB}"`).join('\n') + '\n\n' +
        `## Unique Insights\n` + (data.uniqueInsights || []).map(u => `### ${u.document}\n${u.insight}\n`).join('\n') + '\n' +
        `## Overall Synthesis\n${data.overallSynthesis || ''}\n\n` +
        `## Strategic Recommendations\n` + (data.recommendations || []).map(r => `- ✓ ${r}`).join('\n');
    }
  }

  if (!content) return;
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
