import mysql.connector
import pymongo
from datetime import datetime, date
import json
import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

print("""
╔══════════════════════════════════════════════╗
║   MySQL to MongoDB Migration Tool            ║
║   Lottery Prediction Database                ║
╚══════════════════════════════════════════════╝
""")

class LotteryMigrator:
    def __init__(self):
        # MySQL connection
        mysql_config = {
            'host': os.getenv('MYSQL_HOST', 'localhost'),
            'user': os.getenv('MYSQL_USER', 'root'),
            'password': os.getenv('MYSQL_PASSWORD', ''),
            'database': os.getenv('MYSQL_DATABASE', 'lottery_prediction_db')
        }
        
        # MongoDB connection
        mongodb_uri = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/')
        mongodb_db = os.getenv('MONGODB_DB', 'lottery_prediction_db')
        
        print(f"Connecting to MySQL at {mysql_config['host']}...")
        try:
            self.mysql_conn = mysql.connector.connect(**mysql_config)
            self.mysql_cursor = self.mysql_conn.cursor(dictionary=True)
            print("✅ MySQL connected")
        except mysql.connector.Error as e:
            print(f"❌ MySQL connection failed: {e}")
            sys.exit(1)
        
        print(f"Connecting to MongoDB at {mongodb_uri[:30]}...")
        try:
            self.mongo_client = pymongo.MongoClient(mongodb_uri, serverSelectionTimeoutMS=5000)
            # Test connection
            self.mongo_client.admin.command('ping')
            self.mongo_db = self.mongo_client[mongodb_db]
            print("✅ MongoDB connected")
        except Exception as e:
            print(f"❌ MongoDB connection failed: {e}")
            print("\nPlease ensure:")
            print("1. MongoDB is installed and running locally, OR")
            print("2. Your MongoDB Atlas connection string is correct in .env")
            sys.exit(1)
    
    def parse_numbers(self, numbers_text):
        """Parse lottery numbers from text/json"""
        if not numbers_text:
            return []
        try:
            # Try JSON format
            nums = json.loads(numbers_text)
            if isinstance(nums, list):
                return nums
        except:
            pass
        try:
            # Try comma-separated
            return [int(n.strip()) for n in str(numbers_text).split(',') if n.strip()]
        except:
            return []
    
    def parse_json(self, text):
        """Safely parse JSON"""
        if not text:
            return {}
        try:
            return json.loads(text)
        except:
            return {"raw": text}
    
    def convert_to_datetime(self, value):
        """Convert date to datetime object"""
        if value is None:
            return None
        if isinstance(value, datetime):
            return value
        if isinstance(value, date):
            # Convert date to datetime at midnight
            return datetime.combine(value, datetime.min.time())
        # Try to parse string dates
        try:
            return datetime.strptime(str(value), '%Y-%m-%d')
        except:
            return value
    
    def migrate_table(self, table_name, collection_name, transform_func=None):
        """Generic table migration"""
        print(f"\n📥 Migrating {table_name}...")
        
        try:
            # Get count
            self.mysql_cursor.execute(f"SELECT COUNT(*) as cnt FROM {table_name}")
            total = self.mysql_cursor.fetchone()['cnt']
            print(f"  Found {total} records")
            
            if total == 0:
                print(f"  No records to migrate")
                return
            
            # Migrate in batches for large tables
            batch_size = 1000
            offset = 0
            migrated = 0
            
            while offset < total:
                # Get batch of data
                query = f"SELECT * FROM {table_name} LIMIT {batch_size} OFFSET {offset}"
                self.mysql_cursor.execute(query)
                rows = self.mysql_cursor.fetchall()
                
                if not rows:
                    break
                
                # Transform if needed
                if transform_func:
                    docs = []
                    for row in rows:
                        try:
                            doc = transform_func(row)
                            docs.append(doc)
                        except Exception as e:
                            print(f"  ⚠️  Error transforming row {row.get('id', 'unknown')}: {e}")
                            continue
                else:
                    docs = rows
                
                # Insert to MongoDB
                if docs:
                    try:
                        self.mongo_db[collection_name].insert_many(docs, ordered=False)
                        migrated += len(docs)
                        
                        if total > batch_size:
                            print(f"  Migrated {migrated}/{total} records...")
                    except pymongo.errors.BulkWriteError as e:
                        # Some documents may have duplicate _id, count successful ones
                        migrated += e.details['nInserted']
                        print(f"  ⚠️  Some duplicates skipped. Migrated {migrated}/{total} records...")
                
                offset += batch_size
            
            print(f"✅ Migrated {migrated} records to {collection_name}")
            
        except Exception as e:
            print(f"❌ Error migrating {table_name}: {e}")
    
    def transform_user(self, user):
        return {
            "_id": user['id'],
            "username": user['username'],
            "email": user['email'],
            "password": user['password'],
            "role": user['role'],
            "isActive": bool(user.get('is_active', 1)),
            "lastLogin": self.convert_to_datetime(user.get('last_login')),
            "createdAt": self.convert_to_datetime(user.get('created_at')) or datetime.now(),
            "updatedAt": self.convert_to_datetime(user.get('updated_at')) or datetime.now()
        }
    
    def transform_session(self, session):
        return {
            "_id": session['sid'],
            "expires": self.convert_to_datetime(session['expires']),
            "data": session.get('data', ''),
            "createdAt": self.convert_to_datetime(session.get('created_at')) or datetime.now(),
            "updatedAt": self.convert_to_datetime(session.get('updated_at')) or datetime.now()
        }
    
    def transform_lottery_result(self, result):
        return {
            "_id": result['id'],
            "gameType": result['game_type'],
            "drawDate": self.convert_to_datetime(result.get('draw_date')),
            "numbers": self.parse_numbers(result.get('numbers')),
            "bonus": result.get('bonus'),
            "drawNumber": result.get('draw_number'),
            "source": result.get('source', 'manual'),
            "metadata": self.parse_json(result.get('metadata')),
            "createdAt": self.convert_to_datetime(result.get('created_at')) or datetime.now(),
            "updatedAt": self.convert_to_datetime(result.get('updated_at')) or datetime.now()
        }
    
    def transform_prediction(self, pred):
        return {
            "_id": pred['id'],
            "userId": pred.get('user_id'),
            "gameType": pred.get('game_type'),
            "predictionType": pred.get('prediction_type'),
            "predictedNumbers": self.parse_numbers(pred.get('predicted_numbers')),
            "bonusPrediction": pred.get('bonus_prediction'),
            "confidenceScore": float(pred.get('confidence_score', 0)) if pred.get('confidence_score') else 0.5,
            "algorithmsUsed": self.parse_json(pred.get('algorithms_used')),
            "analysisPeriod": pred.get('analysis_period', '1month'),
            "metadata": self.parse_json(pred.get('metadata')),
            "isWinner": bool(pred.get('is_winner', 0)),
            "matchedNumbers": pred.get('matched_numbers', 0),
            "createdAt": self.convert_to_datetime(pred.get('created_at')) or datetime.now(),
            "updatedAt": self.convert_to_datetime(pred.get('updated_at')) or datetime.now()
        }
    
    def transform_scheduler_job(self, job):
        return {
            "_id": job['id'],
            "gameType": job['game_type'],
            "isActive": bool(job.get('is_active', 1)),
            "schedule": job.get('schedule'),
            "lastRun": self.convert_to_datetime(job.get('last_run')),
            "nextRun": self.convert_to_datetime(job.get('next_run')),
            "lastStatus": job.get('last_status'),
            "lastError": job.get('last_error'),
            "resultsScraped": int(job.get('results_scraped', 0)) if job.get('results_scraped') else 0,
            "totalRuns": int(job.get('total_runs', 0)) if job.get('total_runs') else 0,
            "successfulRuns": int(job.get('successful_runs', 0)) if job.get('successful_runs') else 0,
            "failedRuns": int(job.get('failed_runs', 0)) if job.get('failed_runs') else 0,
            "createdAt": self.convert_to_datetime(job.get('created_at')) or datetime.now(),
            "updatedAt": self.convert_to_datetime(job.get('updated_at')) or datetime.now()
        }
    
    def transform_admin_log(self, log):
        return {
            "_id": log['id'],
            "userId": log.get('user_id'),
            "action": log.get('action'),
            "details": self.parse_json(log.get('details')),
            "ipAddress": log.get('ip_address'),
            "userAgent": log.get('user_agent'),
            "createdAt": self.convert_to_datetime(log.get('created_at')) or datetime.now(),
            "updatedAt": self.convert_to_datetime(log.get('updated_at')) or datetime.now()
        }
    
    def create_indexes(self):
        """Create MongoDB indexes for better performance"""
        print("\n📑 Creating indexes...")
        
        try:
            # Users indexes
            self.mongo_db.users.create_index("username", unique=True, background=True)
            self.mongo_db.users.create_index("email", unique=True, background=True)
            self.mongo_db.users.create_index("role", background=True)
            
            # Lottery results indexes
            self.mongo_db.lottery_results.create_index([("gameType", 1), ("drawDate", -1)], background=True)
            self.mongo_db.lottery_results.create_index("drawNumber", background=True)
            
            # Sessions index
            self.mongo_db.sessions.create_index("expires", background=True)
            
            # Predictions indexes
            self.mongo_db.predictions.create_index([("userId", 1), ("createdAt", -1)], background=True)
            self.mongo_db.predictions.create_index("gameType", background=True)
            
            # Scheduler jobs index
            self.mongo_db.scheduler_jobs.create_index([("gameType", 1), ("isActive", 1)], background=True)
            
            # Admin logs index
            self.mongo_db.admin_logs.create_index([("userId", 1), ("createdAt", -1)], background=True)
            
            print("✅ Indexes created successfully")
        except Exception as e:
            print(f"⚠️  Error creating indexes: {e}")
    
    def validate_migration(self):
        """Validate migration by comparing counts"""
        print("\n🔍 Validating migration...")
        
        tables = [
            ('users', 'users'),
            ('sessions', 'sessions'),
            ('lottery_results', 'lottery_results'),
            ('predictions', 'predictions'),
            ('scheduler_jobs', 'scheduler_jobs'),
            ('admin_logs', 'admin_logs')
        ]
        
        all_valid = True
        total_mysql = 0
        total_mongo = 0
        
        for mysql_table, mongo_collection in tables:
            try:
                # Get MySQL count
                self.mysql_cursor.execute(f"SELECT COUNT(*) as cnt FROM {mysql_table}")
                mysql_count = self.mysql_cursor.fetchone()['cnt']
                total_mysql += mysql_count
                
                # Get MongoDB count
                mongo_count = self.mongo_db[mongo_collection].count_documents({})
                total_mongo += mongo_count
                
                # Check if counts match
                status = "✅" if mysql_count == mongo_count else "❌"
                print(f"  {status} {mysql_table:20s}: MySQL={mysql_count:6d}, MongoDB={mongo_count:6d}")
                
                if mysql_count != mongo_count:
                    all_valid = False
                    
            except Exception as e:
                print(f"  ❌ Error validating {mysql_table}: {e}")
                all_valid = False
        
        print(f"\n  Total records: MySQL={total_mysql}, MongoDB={total_mongo}")
        return all_valid
    
    def show_sample_data(self):
        """Show sample data from MongoDB"""
        print("\n📄 Sample migrated data:")
        
        # Show sample user
        user = self.mongo_db.users.find_one({}, {'password': 0})
        if user:
            print(f"\n  Sample User:")
            print(f"    Username: {user.get('username')}")
            print(f"    Email: {user.get('email')}")
            print(f"    Role: {user.get('role')}")
        
        # Show sample lottery result
        result = self.mongo_db.lottery_results.find_one({})
        if result:
            print(f"\n  Sample Lottery Result:")
            print(f"    Game Type: {result.get('gameType')}")
            print(f"    Draw Date: {result.get('drawDate')}")
            print(f"    Numbers: {result.get('numbers')}")
            print(f"    Bonus: {result.get('bonus')}")
    
    def run(self):
        """Execute migration"""
        start_time = datetime.now()
        
        try:
            print("\n🚀 Starting Migration...")
            print("=" * 60)
            
            # Ask if user wants to clear existing data
            response = input("\nClear existing MongoDB data before migration? (y/N): ").lower().strip()
            if response == 'y':
                print("\n🗑️  Clearing existing MongoDB data...")
                collections = ['users', 'sessions', 'lottery_results', 
                             'predictions', 'scheduler_jobs', 'admin_logs']
                for collection in collections:
                    count = self.mongo_db[collection].count_documents({})
                    if count > 0:
                        self.mongo_db[collection].delete_many({})
                        print(f"  Cleared {count} documents from {collection}")
                print("  ✅ Existing data cleared")
            
            # Migrate tables with proper transformations
            self.migrate_table('users', 'users', self.transform_user)
            self.migrate_table('sessions', 'sessions', self.transform_session)
            self.migrate_table('lottery_results', 'lottery_results', self.transform_lottery_result)
            self.migrate_table('predictions', 'predictions', self.transform_prediction)
            self.migrate_table('scheduler_jobs', 'scheduler_jobs', self.transform_scheduler_job)
            self.migrate_table('admin_logs', 'admin_logs', self.transform_admin_log)
            
            # Create indexes
            self.create_indexes()
            
            # Validate migration
            is_valid = self.validate_migration()
            
            # Show sample data
            self.show_sample_data()
            
            duration = (datetime.now() - start_time).total_seconds()
            
            print("\n" + "=" * 60)
            
            if is_valid:
                print(f"✅ MIGRATION COMPLETED SUCCESSFULLY!")
                print(f"⏱️  Total time: {duration:.2f} seconds")
                
                # Show connection info for application
                print(f"\n📌 MongoDB Connection Info:")
                print(f"  URI: {os.getenv('MONGODB_URI')}")
                print(f"  Database: {os.getenv('MONGODB_DB')}")
                print(f"\n  Use this connection string in your application")
                
            else:
                print(f"⚠️  Migration completed with validation errors")
                print(f"   Please check the counts above for discrepancies")
                print(f"   This might be due to duplicate records or data issues")
            
            print("\n💡 Next steps:")
            print("  1. Update your application's database connection to MongoDB")
            print("  2. Test your application with the migrated data")
            print("  3. Set up regular MongoDB backups")
            
        except mysql.connector.Error as e:
            print(f"\n❌ MySQL Error: {e}")
            print("   Please check:")
            print("   - MySQL is running")
            print("   - Credentials in .env are correct")
            print("   - Database name is correct")
        except pymongo.errors.ConnectionFailure as e:
            print(f"\n❌ MongoDB Connection Error: {e}")
            print("   Please ensure:")
            print("   - MongoDB is installed and running locally, OR")
            print("   - MongoDB Atlas connection string is correct")
        except KeyboardInterrupt:
            print("\n\n⚠️  Migration cancelled by user")
        except Exception as e:
            print(f"\n❌ Migration failed: {e}")
            import traceback
            traceback.print_exc()
        finally:
            # Close connections
            try:
                self.mysql_cursor.close()
                self.mysql_conn.close()
                self.mongo_client.close()
                print("\n📪 Database connections closed")
            except:
                pass

# Main execution
if __name__ == "__main__":
    try:
        # Check if required packages are installed
        try:
            import mysql.connector
            import pymongo
            from dotenv import load_dotenv
        except ImportError as e:
            print(f"❌ Missing required package: {e}")
            print("\nPlease install required packages:")
            print("  python -m pip install mysql-connector-python pymongo python-dotenv")
            sys.exit(1)
        
        # Check if .env file exists
        if not os.path.exists('.env'):
            print("❌ .env file not found!")
            print("\nPlease create a .env file with:")
            print("  MYSQL_HOST=localhost")
            print("  MYSQL_USER=root")
            print("  MYSQL_PASSWORD=yourpassword")
            print("  MYSQL_DATABASE=lottery_prediction_db")
            print("  MONGODB_URI=mongodb://localhost:27017/")
            print("  MONGODB_DB=lottery_prediction_db")
            sys.exit(1)
        
        # Run migration
        migrator = LotteryMigrator()
        migrator.run()
        
    except Exception as e:
        print(f"\n❌ Failed to start migration: {e}")
        print("\nPlease ensure:")
        print("1. MySQL is running (check phpMyAdmin)")
        print("2. MongoDB is running or Atlas is configured")
        print("3. .env file has correct credentials")
        print("4. All required packages are installed")