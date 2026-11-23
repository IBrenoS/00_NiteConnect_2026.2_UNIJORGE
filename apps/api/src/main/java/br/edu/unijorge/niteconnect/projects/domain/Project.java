package br.edu.unijorge.niteconnect.projects.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record Project(UUID id, String title, String description, ProjectStatus status,
                      LocalDate startsOn, LocalDate endsOn, UUID proposalId, UUID createdBy,
                      long version, Instant createdAt, Instant updatedAt, String coverImageUrl) {}
