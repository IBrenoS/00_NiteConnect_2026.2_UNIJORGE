package br.edu.unijorge.niteconnect.activities.planning.domain;

import java.time.Instant;
import java.util.UUID;

public record ActivityPlanning(UUID id, String title, String description, UUID projectId, UUID createdBy,
                               long version, Instant createdAt, Instant updatedAt) {}
