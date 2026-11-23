FROM maven:3.9.11-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml ./
COPY src ./src
RUN mvn --batch-mode -DskipTests package

FROM eclipse-temurin:21-jre-jammy
WORKDIR /app
COPY --from=build --chown=10001:10001 /workspace/target/nite-connect-api-0.0.1-SNAPSHOT.jar /app/app.jar
COPY --chmod=755 start.sh /app/start.sh
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["/app/start.sh"]
CMD ["--nite.bootstrap.enabled=false"]
