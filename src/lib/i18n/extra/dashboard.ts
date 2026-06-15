// dashboard area translations (filled by the i18n audit).
// All keys live under the `dashx` namespace, e.g. t("dashx.grades").
export const dict = {
  en: {
    dashx: {
      // Card titles
      grades: "Grades",
      homework: "Homework",
      gradeDetails: "Grade Details",
      dailyAttendance: "Daily Attendance",

      // Badges
      gradesForPeriod: "Grades for {period}",
      homeworkDue: "Homework due today or next 2 days",
      recentGradedWork: "Recent graded work",
      absenceSummary: "Absence type summary for the year",

      // Navigation / actions
      backToHome: "← Back to Home",
      viewAllGrades: "View all grades",
      viewAllGradeDetails: "View all grade details",
      backToGrades: "← back to Grades",
      seeAllDetails: "see all details ({n})",

      // Empty states
      noHomework: "No homework.",
      noGradeDetails: "There are no grade details available at this time.",
      noAttendance: "No attendance records.",
      noGrades: "No grades have been posted yet.",
      perfectAttendance: "Perfect attendance 🎉",
      loadingRecords: "Loading {name}'s records…",

      // Attendance table
      absenceType: "Absence Type",
      count: "Count",
      unexcusedAbsence: "Unexcused Absence",
      tardy: "Tardy",
      excusedAbsence: "Excused Absence",

      // Selectors / labels
      class: "Class",
      allReportingPeriods: "All reporting periods",
      viewBy: "View By:",
      date: "Date",
      type: "Type",
      classMark: "Class Mark",
      periods: "Periods",
      all: "All",

      // Grade table headers
      course: "Course",
      grade: "Grade",
      asOf: "As Of",
      assignment: "Assignment",
      mark: "Mark",
      openDetailsFor: "Open details for {name}",

      // Fallback values
      defaultCourse: "Course",

      // Page titles / parent view
      home: "Home",
      messages: "Messages",
      studentId: "Student ID: {id}",
      student: "Student",
      selectChild: "Select a child below to view their academic record.",

      // Navbar
      help: "Help",
      myAccount: "My Account",
      signOut: "Sign Out",
    },
  },
  fr: {
    dashx: {
      grades: "Notes",
      homework: "Devoirs",
      gradeDetails: "Détail des notes",
      dailyAttendance: "Présence quotidienne",

      gradesForPeriod: "Notes pour {period}",
      homeworkDue: "Devoirs à rendre aujourd'hui ou dans les 2 prochains jours",
      recentGradedWork: "Travaux récemment notés",
      absenceSummary: "Récapitulatif des types d'absence pour l'année",

      backToHome: "← Retour à l'accueil",
      viewAllGrades: "Voir toutes les notes",
      viewAllGradeDetails: "Voir tout le détail des notes",
      backToGrades: "← retour aux Notes",
      seeAllDetails: "voir tous les détails ({n})",

      noHomework: "Aucun devoir.",
      noGradeDetails: "Aucun détail de note n'est disponible pour le moment.",
      noAttendance: "Aucun relevé de présence.",
      noGrades: "Aucune note n'a encore été publiée.",
      perfectAttendance: "Présence parfaite 🎉",
      loadingRecords: "Chargement des relevés de {name}…",

      absenceType: "Type d'absence",
      count: "Nombre",
      unexcusedAbsence: "Absence non justifiée",
      tardy: "Retard",
      excusedAbsence: "Absence justifiée",

      class: "Classe",
      allReportingPeriods: "Toutes les périodes",
      viewBy: "Afficher par :",
      date: "Date",
      type: "Type",
      classMark: "Moyenne de la classe",
      periods: "Périodes",
      all: "Toutes",

      course: "Matière",
      grade: "Note",
      asOf: "En date du",
      assignment: "Devoir",
      mark: "Note",
      openDetailsFor: "Ouvrir le détail de {name}",

      defaultCourse: "Matière",

      home: "Accueil",
      messages: "Messages",
      studentId: "Identifiant élève : {id}",
      student: "Élève",
      selectChild: "Sélectionnez un enfant ci-dessous pour consulter son dossier scolaire.",

      help: "Aide",
      myAccount: "Mon compte",
      signOut: "Se déconnecter",
    },
  },
  ar: {
    dashx: {} as Record<string, unknown>,
  },
};
