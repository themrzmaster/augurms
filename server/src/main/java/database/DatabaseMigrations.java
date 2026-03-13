package database;

import liquibase.Liquibase;
import liquibase.UpdateSummaryOutputEnum;
import liquibase.database.jvm.JdbcConnection;
import liquibase.exception.LiquibaseException;
import liquibase.resource.ClassLoaderResourceAccessor;
import tools.DatabaseConnection;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Apply changes to the database so that the server and database work in harmony.
 *
 * @author Ponk
 */
public class DatabaseMigrations {
    private static final String ROOT_CHANGELOG_FILE = "db/changelog-root.xml";

    public static void runDatabaseMigrations() {
        suppressLiquibaseLogs();
        runLiquibaseUpdate();
    }

    private static void suppressLiquibaseLogs() {
        Logger liquibaseLogger = Logger.getLogger("liquibase");
        liquibaseLogger.setLevel(Level.WARNING);
    }

    private static void runLiquibaseUpdate() {
        try (Connection connection = DatabaseConnection.getConnection()) {
            liquibase.database.DatabaseConnection databaseConnection = new JdbcConnection(connection);
            Liquibase liquibase = new Liquibase(ROOT_CHANGELOG_FILE, new ClassLoaderResourceAccessor(),
                    databaseConnection);
            liquibase.setShowSummaryOutput(UpdateSummaryOutputEnum.LOG);
            liquibase.update();
        } catch (SQLException | LiquibaseException e) {
            throw new RuntimeException("Failed to run database migrations", e);
        }
    }
}
