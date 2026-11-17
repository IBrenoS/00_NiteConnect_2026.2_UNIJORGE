package br.edu.unijorge.niteconnect.activities.application;

import br.edu.unijorge.niteconnect.activities.infrastructure.ActivityEvidenceDeletionOutbox;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class ActivityEvidenceDeletionWorker {
    private static final Logger log = LoggerFactory.getLogger(ActivityEvidenceDeletionWorker.class);
    private final ActivityEvidenceDeletionOutbox outbox;
    private final EvidenceObjectStore storage;

    public ActivityEvidenceDeletionWorker(ActivityEvidenceDeletionOutbox outbox, EvidenceObjectStore storage) {
        this.outbox = outbox;
        this.storage = storage;
    }

    @Scheduled(fixedDelayString="${nite.activities.evidence-deletion-poll-delay-ms:30000}")
    public void retryPendingDeletes() {
        for (var job : outbox.claim(50)) {
            try {
                storage.delete(job.objectKey());
                outbox.complete(job.id());
            } catch (RuntimeException failure) {
                outbox.retry(job.id(), failure.getClass().getSimpleName());
                log.warn("Private activity evidence deletion retry scheduled: {}", failure.getClass().getSimpleName());
            }
        }
    }
}
