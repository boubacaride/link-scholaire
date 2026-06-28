// Attendance & Performance admin dashboard translations.
export const dict = {
  en: {
    perf: {
      title: "Attendance & Performance",
      subtitle: "School-wide attendance, academics and month-over-month trends.",
      adminOnly: "Only administrators can view the Attendance & Performance dashboard.",
      tabAttendance: "Attendance",
      tabAcademic: "Academic Overview",
      tabTrends: "Trends",
      // Filters
      gradeLevel: "Grade level",
      allGrades: "All grades",
      grade: "Grade {n}",
      // KPI cards
      kpiAttendance: "Attendance rate",
      kpiAcademic: "Academic average",
      kpiBelowTarget: "Grade levels below target",
      kpiStudents: "Students counted",
      thisMonth: "this month",
      noPrev: "no prior month",
      // Academic Overview
      overviewTitle: "Academic overview by grade level",
      colGradeLevel: "Grade level",
      colAcademic: "Academic average",
      colAttendance: "Attendance rate",
      colStudents: "Students",
      wholeSchool: "Whole school",
      // Trends
      trendsTitle: "Month-over-month trend",
      academicAxis: "Academic average (%)",
      attendanceAxis: "Attendance rate (%)",
      trendEmpty: "No trend data yet.",
      // Empty / setup states
      noSnapshots:
        "No performance snapshots yet. Apply migration 039 and run capture_performance_snapshot() for each month (see docs), then refresh.",
      loading: "Loading…",
    },
  } as Record<string, unknown>,
  fr: {
    perf: {
      title: "Présence et Performances",
      subtitle: "Présence, résultats scolaires et tendances mensuelles à l'échelle de l'école.",
      adminOnly: "Seuls les administrateurs peuvent voir le tableau de bord Présence et Performances.",
      tabAttendance: "Présence",
      tabAcademic: "Aperçu scolaire",
      tabTrends: "Tendances",
      gradeLevel: "Niveau",
      allGrades: "Tous les niveaux",
      grade: "Niveau {n}",
      kpiAttendance: "Taux de présence",
      kpiAcademic: "Moyenne scolaire",
      kpiBelowTarget: "Niveaux sous l'objectif",
      kpiStudents: "Élèves comptés",
      thisMonth: "ce mois-ci",
      noPrev: "pas de mois précédent",
      overviewTitle: "Aperçu scolaire par niveau",
      colGradeLevel: "Niveau",
      colAcademic: "Moyenne scolaire",
      colAttendance: "Taux de présence",
      colStudents: "Élèves",
      wholeSchool: "Toute l'école",
      trendsTitle: "Tendance mensuelle",
      academicAxis: "Moyenne scolaire (%)",
      attendanceAxis: "Taux de présence (%)",
      trendEmpty: "Pas encore de données de tendance.",
      noSnapshots:
        "Aucun instantané de performance pour le moment. Appliquez la migration 039 et exécutez capture_performance_snapshot() pour chaque mois (voir la doc), puis actualisez.",
      loading: "Chargement…",
    },
  } as Record<string, unknown>,
  ar: {} as Record<string, unknown>,
};
