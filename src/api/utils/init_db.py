import logging
import pandas as pd
from sqlalchemy.orm import Session
from ..db import engine
from ..models import Base, TransportLine

logger = logging.getLogger(__name__)

TRANSPORT_META_PATH = 'data/processed/transport_meta.parquet'


def init_db(db: Session):
    logger.info("Checking database...")
    # Create tables if they don't exist
    Base.metadata.create_all(bind=engine)

    # Check if the transport_lines table is empty
    if db.query(TransportLine).count() == 0:
        logger.info("Database is empty. Populating from parquet file...")
        try:
            df = pd.read_parquet(TRANSPORT_META_PATH)
            # Use a bulk insert for efficiency
            db.bulk_insert_mappings(TransportLine, df.to_dict(orient='records'))
            db.commit()
            logger.info("Database populated successfully with %d transport lines.", len(df))
        except FileNotFoundError:
            logger.error("%s not found. Cannot populate database.", TRANSPORT_META_PATH)
        except Exception as e:
            logger.exception("An error occurred during database population: %s", e)
            db.rollback()
    else:
        logger.info("Database already contains data.")
