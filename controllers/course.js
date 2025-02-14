const uuid = require("uuid");
// const { getSignedUrl } = require("@aws-sdk/cloudfront-signer");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const {
   S3Client,
   PutObjectCommand,
   DeleteObjectCommand,
   GetObjectCommand,
} = require("@aws-sdk/client-s3");
const env = require("../env");
const Course = require("../models/course_model");

const aws_s3 = new S3Client({
   credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY,
      secretAccessKey: process.env.AWS_SECRET_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN,
   },
   region: process.env.AWS_BUCKET_REGION,
});

exports.index = async (req, res) => {
   try {
      const course = await Course.findAll();

      const courseData = await Promise.all(
         course.map(async (i) => {
            let imgUrl = null;

            if (i.dataValues.coursePics) {
               const command = new GetObjectCommand({
                  Bucket: process.env.AWS_BUCKET_NAME,
                  Key: i.coursePics,
               });

               imgUrl = await getSignedUrl(aws_s3, command, { expiresIn: 86400 }); // Expire in 24 hours
            }

            return {
               ...i.dataValues,
               coursePics: imgUrl,
            };
         })
      );

      res.status(200).json({
         status: "SUCCESS",
         error_code: "",
         message: "Retrieve all data success!",
         data: courseData,
      });
   } catch (error) {
      res.status(500).json({
         status: "ERROR",
         error_code: error.name || "ERR_INTRL_SRV_ERR",
         message: error.errors
            ? error.errors[0].message
            : error.message || "Internal Server Error",
      });
   }
};

exports.getById = async (req, res) => {
   try {
      const id = req.params.courseId;
      const courseData = await Course.findByPk(id);

      if (!courseData) {
         return res.status(404).json({
            status: "ERROR",
            error_code: "dataNotFound",
            message: "Course not found!",
         });
      }

      let imgUrl = null;
      if (courseData.coursePics) {
         const command = new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: courseData.coursePics,
         });

         imgUrl = await getSignedUrl(aws_s3, command, { expiresIn: 86400 }); // Expire in 24 jam
      }

      res.status(200).json({
         status: "SUCCESS",
         error_code: "",
         message: "Data found!",
         data: {
            ...courseData.dataValues,
            coursePics: imgUrl,
         },
      });
   } catch (error) {
      res.status(500).json({
         status: "ERROR",
         error_code: error.name || "ERR_INTRL_SRV_ERR",
         message: error.errors
            ? error.errors[0].message
            : error.message || "Internal Server Error",
      });
   }
};

exports.create = async (req, res) => {
   try {
      const {
         courseId,
         courseName,
         courseDesc,
         courseCategory,
         courseLevel,
         price,
      } = req.body;

      let fileName;
      if (req.files) {
         if (req.files.length > 0) {
            if (req.files[0].fieldname == "coverImage") {
               fileName = req.files[0].key;
            }
         }
      }

      const coursePics = fileName || null;

      const rawData = {
         courseId,
         courseName,
         courseDesc,
         courseCategory,
         courseLevel,
         coursePics,
         price,
      };

      const course = await Course.create(rawData);

      res.status(200).json({
         status: "SUCCESS",
         error_code: "",
         message: "Create new course success!",
         data: course,
      });
   } catch (error) {
      // console.log(new Error(error));
      res.status(500).json({
         status: "ERROR",
         error_code: error.name || "ERR_INTRL_SRV_ERR",
         message: error.errors
            ? error.errors[0].message
            : error.message || "Internal Server Error",
      });
   }
};

exports.update = async (req, res) => {
   try {
      const {
         courseId,
         courseName,
         courseDesc,
         courseCategory,
         courseLevel,
         price,
      } = req.body;

      const course = await Course.findByPk(courseId);
      let coursePics;

      if (req.files) {
         if (req.files.length > 0) {
            if ((req.files[0].fileName = "coverImage")) {
               const file = req.files[0];
               const origFileName = file.originalname.split(".");
               const s3FileName = `coverImages/${uuid.v4()}.${origFileName[1]}`;
               coursePics =
                  course.coursePics == null ? s3FileName : course.coursePics;
               const params = {
                  Bucket: process.env.AWS_BUCKET_NAME,
                  Key:
                     course.coursePics == null ? s3FileName : course.coursePics,
                  Body: file.buffer,
                  contentTyoe: file.mimetype,
               };

               const command = new PutObjectCommand(params);
               await s3.send(command);
            }
         }
      }

      const rawData = {
         courseId,
         courseName,
         courseDesc,
         courseCategory,
         courseLevel,
         coursePics,
         price,
      };

      const update = await Course.update(rawData, { where: { courseId } });
      if (update[0] == 0) {
         res.status(404).json({
            status: "ERROR",
            error_code: "dataNotFound",
            message: "Course not found!",
         });
         return;
      }

      const courseUpdate = await Course.findByPk(courseId);

      res.status(200).json({
         status: "SUCCESS",
         error_code: "",
         message: "Update course success!",
         data: courseUpdate,
      });
   } catch (error) {
      // console.log(new Error(error));
      res.status(500).json({
         status: "ERROR",
         error_code: error.name || "ERR_INTRL_SRV_ERR",
         message: error.errors
            ? error.errors[0].message
            : error.message || "Internal Server Error",
      });
   }
};

exports.delete = async (req, res) => {
   try {
      const courseId = req.params.courseId;
      const course = await Course.findByPk(courseId);
      
      if (!course) {
         return res.status(404).json({
            status: "ERROR",
            error_code: "dataNotFound",
            message: "Course not found!",
         });
      }

      // Mengecek apakah ada gambar (coursePics) yang perlu dihapus dari S3
      if (course.coursePics !== null) {
         const params = {
            Bucket: process.env.AWS_BUCKET_NAME, // Nama bucket S3 dari .env
            Key: course.coursePics, // Key gambar di S3
         };

         // Perintah untuk menghapus objek dari S3
         const command = new DeleteObjectCommand(params);

         // Menghapus file dari S3
         await aws_s3.send(command);
      }

      // Menghapus course dari database
      await Course.destroy({ where: { courseId } });

      res.status(200).json({
         status: "SUCCESS",
         error_code: "",
         message: "Delete course success!",
      });
   } catch (error) {
      console.error(error); // Mencatat error di log untuk debugging

      res.status(500).json({
         status: "ERROR",
         error_code: error.name || "ERR_INTRL_SRV_ERR",
         message: error.errors
            ? error.errors[0].message
            : error.message || "Internal Server Error",
      });
   }
};


exports.check = async (req, res) => {
   res.status(200).send("Its works!");
};
