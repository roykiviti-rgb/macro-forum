# פורום שאלות מאקרו א׳

פורום שאלות לקורס מאקרו כלכלה א׳ (57305). כל דיון משויך לשאלה: במבחן (שנה, מועד ושאלה), במרכז למידה או בתרגיל (מספר ושאלה), או לשאלה כללית. לפני שפותחים דיון, הפורום מראה את הדיונים שכבר נפתחו על אותה שאלה ומציע לשמור טיוטה ולעבור אליהם.

- **אתר סטטי:** HTML, CSS ו-JavaScript, בלי שלב בנייה. Vercel מגיש את הקבצים כמו שהם.
- **Firebase:** התחברות עם Google, ו-Firestore לדיונים, לתגובות, לטיוטות ולתמונות.
- **תמונות:** נדחסות בדפדפן ל-JPEG ונשמרות ב-Firestore, אז לא צריך את Cloud Storage ואת התוכנית בתשלום.

## קבצים

| קובץ | מה יש בו |
|---|---|
| `index.html` | מבנה העמוד |
| `styles.css` | העיצוב |
| `app.js` | כל הלוגיקה |
| `firebase-config.js` | הגדרות פרויקט ה-Firebase (צריך למלא) |
| `firestore.rules` | כללי האבטחה: מי קורא ומי כותב מה |
| `vercel.json` | הגדרות האירוח ב-Vercel |

## הקמה, צעד אחר צעד

### 1. פרויקט Firebase
1. נכנסים ל-https://console.firebase.google.com ולוחצים **Create a project**. Google Analytics לא נחוץ.
2. במסך הפרויקט לוחצים על סמל ה-Web (`</>`), נותנים שם לאפליקציה (למשל `macro-forum`) ולוחצים **Register app**. אין צורך ב-Firebase Hosting.
3. מעתיקים את האובייקט `firebaseConfig` שמופיע ומדביקים את הערכים ב-`firebase-config.js`. הערכים האלה ציבוריים מטבעם: מה שמגן על הנתונים הוא `firestore.rules`.

### 2. התחברות עם Google
1. **Build → Authentication → Get started**.
2. בלשונית **Sign-in method** בוחרים **Google**, מפעילים, בוחרים מייל תמיכה ושומרים.

### 3. מסד הנתונים
1. **Build → Firestore Database → Create database**.
2. בוחרים מיקום באירופה (למשל `eur3`) ומצב **production**.
3. בלשונית **Rules** מוחקים את מה שיש, מדביקים את כל התוכן של `firestore.rules` ולוחצים **Publish**.

### 4. העלאה ל-Vercel
1. נכנסים ל-https://vercel.com ונרשמים עם חשבון ה-GitHub.
2. **Add New → Project**, ובוחרים את הריפו הזה (אם הוא לא מופיע, מאשרים ל-Vercel גישה אליו).
3. **Framework Preset:** `Other`. לא משנים Build Command או Output Directory.
4. לוחצים **Deploy**. בסוף מקבלים כתובת כמו `macro-forum.vercel.app`.

### 5. אישור הכתובת ב-Firebase
Google מאפשר להתחבר רק מכתובות מאושרות.
1. **Authentication → Settings → Authorized domains → Add domain**.
2. מוסיפים את הכתובת מ-Vercel, בלי `https://` (למשל `macro-forum.vercel.app`).

### 6. הרשאת מנהל (מחיקת הודעות של אחרים)
1. נכנסים לאתר ומתחברים פעם אחת.
2. ב-Firebase: **Authentication → Users**, מעתיקים את ה-**User UID** שלכם.
3. ב-**Firestore Database → Data**: **Start collection** בשם `admins`. ה-**Document ID** הוא ה-UID, ומוסיפים שדה כלשהו, למשל `role` עם הערך `admin`.

מתרגלים מוסיפים באותה דרך.

## עדכונים
כל דחיפה ל-`main` בריפו מעלה גרסה חדשה ל-Vercel אוטומטית, תוך פחות מדקה.

אם משנים את `firestore.rules`, צריך להדביק אותו מחדש ב-Firebase (שלב 3). Vercel לא מעדכן אותו.

## מי יכול מה
- **צפייה ופרסום:** כל מי שמתחבר עם חשבון Google יכול לקרוא ולפרסם.
- **מחיקה:** כל אחד יכול למחוק רק את ההודעות שלו. מנהלים יכולים למחוק הכול.
- **טיוטות וכוכבים:** פרטיים, ורק בעליהם רואים אותם.

### הגבלה למיילים של האוניברסיטה (לא חובה)
ב-`firestore.rules` מחליפים את השורה:

```
function signedIn() { return request.auth != null; }
```

בשורה:

```
function signedIn() { return request.auth != null && request.auth.token.email.matches('.*@mail[.]huji[.]ac[.]il$'); }
```

ומפרסמים את הכללים מחדש. כך רק מי שמתחבר עם חשבון של האוניברסיטה יוכל לקרוא ולכתוב.

## מגבלות התוכנית החינמית של Firebase
התוכנית החינמית (Spark) כוללת 50,000 קריאות ו-20,000 כתיבות ביום.

כל כניסה לאתר קוראת את כל הדיונים והתגובות. לכן בפורום עם 300 הודעות, כ-150 כניסות ביום יגיעו למגבלה. אם הפורום יגדל מעבר לזה, אפשר לשנות את האתר כך שיקרא תגובות רק של הדיון שפתוח.
