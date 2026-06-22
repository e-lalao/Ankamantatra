import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

export interface Question {
  question: string;
  reponse: string;
  difficulte: number;
}

// ← Remplacez VOTRE_SHEET_ID par l'ID de votre Google Sheet
// Pour trouver l'ID : ouvrez votre Google Sheet, l'URL ressemble à
// https://docs.google.com/spreadsheets/d/VOTRE_SHEET_ID/edit
// Le fichier doit être partagé en "Tout le monde peut voir"
export const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1W-35TFLSI582_IlBNykoCon01Aj2n8bq/export?format=csv';

@Injectable({ providedIn: 'root' })
export class QuizService {
  private http = inject(HttpClient);

  fetchQuestions(): Observable<Question[]> {
    return this.http.get(SHEET_URL, { responseType: 'text' }).pipe(
      map(csv => this.parseCsv(csv))
    );
  }

  private parseCsv(csv: string): Question[] {
    const lines = csv.trim().split('\n');
    return lines
      .slice(1)
      .map(line => {
        const parts = this.parseLine(line);
        return {
          question:   (parts[0] ?? '').replace(/^"|"$/g, '').trim(),
          reponse:    (parts[1] ?? '').replace(/^"|"$/g, '').trim(),
          difficulte: parseInt((parts[2] ?? '1').replace(/^"|"$/g, '').trim(), 10) || 1,
        };
      })
      .filter(q => q.question && q.reponse);
  }

  private parseLine(line: string): string[] {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === ',' && !inQuotes) { result.push(cur); cur = ''; }
      else cur += ch;
    }
    result.push(cur);
    return result;
  }

  filterByDifficulty(questions: Question[], level: 1 | 2): Question[] {
    return questions.filter(q => q.difficulte === level);
  }

  shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Conjonctions/particules malgaches à ignorer dans la comparaison
  private readonly STOP_WORDS = new Set([
    'sy', 'ary', 'na', 'dia', 'ka', 'nefa', 'fa', 'koa', 'mbamin',
    'avy', 'ihany', 'kosa', 'anefa', 'saingy', 'nohony', 'nogony'
  ]);

  // Comparaison exacte (insensible casse, tirets, espaces)
  normalize(s: string): string {
    return s.toLowerCase().replace(/[-\s'`]/g, '');
  }

  // Comparaison intelligente : ordre des mots libre + conjonctions ignorées
  // Ex: "laona sy fanoto ary vary" == "vary, fanoto, laona"  → true
  smartMatch(userAnswer: string, correctAnswer: string): boolean {
    const tokenize = (s: string): string[] =>
      s
        .toLowerCase()
        .replace(/[,;\/\\–—]/g, ' ')        // séparateurs → espace
        .replace(/['`'']/g, '')              // apostrophes
        .split(/\s+/)
        .map(w => w.replace(/[^a-zàâäéèêëîïôùûüç]/gi, ''))
        .filter(w => w.length > 0 && !this.STOP_WORDS.has(w))
        .sort();

    const a = tokenize(userAnswer);
    const b = tokenize(correctAnswer);

    return a.length > 0
      && a.length === b.length
      && a.every((w, i) => w === b[i]);
  }
}
