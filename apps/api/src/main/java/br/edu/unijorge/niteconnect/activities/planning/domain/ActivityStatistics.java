package br.edu.unijorge.niteconnect.activities.planning.domain;

public record ActivityStatistics(long total, long planned, long inProgress, long completed, long cancelled,
                                 long overdue, long completionDenominator, double plannedRate,
                                 double inProgressRate, double completedRate, double cancelledRate,
                                 double completionRate) {}
